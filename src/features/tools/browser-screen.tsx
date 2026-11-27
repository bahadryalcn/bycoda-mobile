import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Stack } from "expo-router";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import ExternalLink from "lucide-react-native/icons/external-link";
import { useHostClient, useHostReadActive } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import type { HostProject } from "@/domain/types";
import { Linking } from "react-native";
import { Body, Button, StateView, Disclosure, ErrorText, Field, FormActions, IconButton, Loading, Notice, Row, Screen, Sheet, showToast } from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { RemoteFrame } from "@/ui/remote-frame";
import { ActionField } from "@/ui/action-field";
import { ActionMenu } from "@/ui/overflow-menu";
import Keyboard from "lucide-react-native/icons/keyboard";
import { useCopy } from "@/ui/copy";
import { useMachineStatus } from "@/ui/machine-bar";
import { DATA_SAVER_FRAME_QUALITY, useDataSaverActive } from "@/state/data-saver";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";
import type { BrowserState } from "./types";
import { readBrowserCapture } from "./browser-annotation-model";
import { browserAddress, browserErrorMessage, phoneCanOpen } from "./browser-address";
import { useComposerTransfer } from "../workspace/composer-transfer";

type BrowserScope = {
  client: NonNullable<ReturnType<typeof useHostClient>>;
  projectId: string;
  sessionId?: string;
  consumedSelections: Set<string>;
  active: boolean;
  reviewed: ReviewedMachine | undefined;
  latest?: BrowserState;
  releasedLeaseId?: string;
  releasing?: Promise<void>;
};

// A quick leave/reopen must wait for the previous screen's late claim to be released.
const browserCleanupByHost = new Map<string, Promise<void>>();

/** Called after an in-flight request settles, including a claim that outlived its screen. */
function releaseBrowserLease(scope: BrowserScope): Promise<void> {
  const leaseId = scope.latest?.leaseId;
  if (!leaseId || scope.releasedLeaseId === leaseId) return scope.releasing ?? Promise.resolve();
  scope.releasedLeaseId = leaseId;
  scope.releasing = scope.client.request("browser.release", {
    projectId: scope.projectId, leaseId,
  }, { retry: false }).then(() => {}, () => {});
  return scope.releasing;
}

const clientIds = new WeakMap<object, number>();
let nextClientId = 1;
function clientIdentity(client: object | null | undefined) {
  if (!client) return 0;
  let id = clientIds.get(client);
  if (id === undefined) {
    id = nextClientId++;
    clientIds.set(client, id);
  }
  return id;
}

type BrowserDrafts = { url: string; text: string; comment: string };
type BrowserProps = { project: HostProject; initialUrl?: string; sessionId?: string; embedded?: boolean };

/** A transport reconnect retains drafts; a different reviewed target starts a new draft owner. */
export function BrowserScreen({ project, initialUrl = "", sessionId, embedded = false }: BrowserProps) {
  const machine = useActiveMachine();
  const identity = useMemo(() => ({}), [machine?.id, machine?.endpoint, machine?.environmentId, machine?.lanKey, project.id, sessionId, initialUrl]);
  return <BrowserDraftOwner key={clientIdentity(identity)} project={project} initialUrl={initialUrl} sessionId={sessionId} embedded={embedded} />;
}

function BrowserDraftOwner({ project, initialUrl = "", sessionId, embedded }: BrowserProps) {
  const client = useHostClient();
  const [drafts, setDrafts] = useState<BrowserDrafts>(() => ({ url: initialUrl, text: "", comment: "" }));
  const updateDraft = (field: keyof BrowserDrafts, value: string) => setDrafts(previous => ({ ...previous, [field]: value }));
  return <BrowserScreenBody key={clientIdentity(client)} client={client} initialUrl={initialUrl}
    project={project} sessionId={sessionId} embedded={embedded} drafts={drafts} updateDraft={updateDraft} />;
}

/** One serialized request path preserves the shared browser's control lease. */
function BrowserScreenBody({ project, sessionId, client, drafts, updateDraft, embedded, initialUrl }: BrowserProps & {
  client: ReturnType<typeof useHostClient>; drafts: BrowserDrafts; updateDraft: (field: keyof BrowserDrafts, value: string) => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const active = useHostReadActive();
  const machine = useActiveMachine();
  const connection = useMachineStatus();
  const dataSaver = useDataSaverActive();
  const dataSaverRef = useRef(dataSaver);
  dataSaverRef.current = dataSaver;
  const composerTransfer = useComposerTransfer();
  const { url, text, comment } = drafts;
  const draftMounted = useRef(false), draftActive = useRef(active);
  draftActive.current = active;
  useLayoutEffect(() => { draftMounted.current = true; return () => { draftMounted.current = false; }; }, []);
  // Native input delivery can outlive a transport body whose draft owner survives.
  const editDraft = (field: keyof BrowserDrafts, value: string) => {
    if (draftMounted.current && draftActive.current && client && isReviewedMachine(reviewedMachine(client.machine), useMachines.getState())) updateDraft(field, value);
  };
  const setUrl = (value: string) => {
    editDraft("url", value);
    // A corrected address retires the previous address's error.
    setAddressError(undefined);
    if (lastMethod === "browser.open" && action.error && !action.isPending) action.reset();
  };
  const setText = (value: string) => editDraft("text", value);
  const setComment = (value: string) => editDraft("comment", value);
  const [drafting, setDrafting] = useState(false);
  const [selectionError, setSelectionError] = useState<unknown>(); const [preparedSelection, setPreparedSelection] = useState<string>();
  const action = useAsyncAction<BrowserState>();
  const [browserState, setState] = useState<BrowserState>();
  const [browserFrame, setFrame] = useState<BrowserState>();
  const [now, setNow] = useState(Date.now());
  const scopeRef = useRef<BrowserScope | undefined>(undefined);
  const pending = useRef<Promise<BrowserState | undefined> | undefined>(undefined);
  const cleanup = useRef(Promise.resolve());
  const [actionScope, setActionScope] = useState<BrowserScope>();
  // Requests are serialized, so the action's error always belongs to the last method sent.
  const [lastMethod, setLastMethod] = useState<string>();
  const [addressError, setAddressError] = useState<string>();
  const [typing, setTyping] = useState(false);
  const current = (scope: BrowserScope) => scope.active && scopeRef.current === scope &&
    isReviewedMachine(scope.reviewed, useMachines.getState());
  // Hide previous-host data on the render that changes scope, before effects run.
  const activeScope = scopeRef.current;
  const visibleScope = activeScope?.client === client && activeScope?.projectId === project.id && activeScope?.sessionId === sessionId
    && current(activeScope) ? activeScope : undefined;
  const state = visibleScope ? browserState : undefined;
  const frame = visibleScope ? browserFrame : undefined;
  // Built once per frame, not per draft keystroke.
  const frameUri = useMemo(
    () => (frame?.data ? `data:${frame.mimeType ?? "image/jpeg"};base64,${frame.data}` : undefined),
    [frame?.data, frame?.mimeType],
  );
  const apply = (scope: BrowserScope, value: BrowserState) => {
    if (value.selection) value = { ...value, selection: readBrowserCapture(value.selection, { projectId: scope.projectId, sessionId: scope.sessionId ?? "", navigationId: value.navigationId ?? "" }) };
    const previousNavigation = scope.latest?.navigationId;
    scope.latest = value;
    if (!current(scope)) return;
    if (previousNavigation !== value.navigationId) setFrame(undefined);
    setState(value);
    setNow(Date.now());
    if (value.data) setFrame(value);
  };
  const requestForScope = (scope: BrowserScope, method: string, params: Record<string, unknown> = {}, capture = false) => {
    if (!current(scope) || pending.current) return;
    setActionScope(scope);
    setLastMethod(method);
    const execution = action.run(async () => {
      try {
        const result = await scope.client.request<BrowserState>(method, {
          projectId: scope.projectId, ...(scope.sessionId ? { sessionId: scope.sessionId } : {}), leaseId: scope.latest?.leaseId,
          ...(method.startsWith("browser.annotation.") ? { navigationId: scope.latest?.navigationId, annotationId: scope.latest?.annotationId } : {}), ...params,
          ...(dataSaverRef.current && (method === "browser.frame" || method === "browser.input") ? { quality: DATA_SAVER_FRAME_QUALITY } : {}),
        }, { retry: false });
        apply(scope, result);
        if (capture && result.open && current(scope)) {
          const screenshot = await scope.client.request<BrowserState>("browser.frame", { projectId: scope.projectId, ...(dataSaverRef.current ? { quality: DATA_SAVER_FRAME_QUALITY } : {}) }, { retry: false });
          apply(scope, screenshot);
        }
        return result;
      } catch (error) {
        if (current(scope) && method.startsWith("browser.annotation.")) {
          scope.latest = scope.latest ? { ...scope.latest, selection: undefined } : undefined;
          setState(scope.latest); setFrame(undefined);
        }
        if (current(scope) && ["auth", "identity"].includes((error as { kind?: string })?.kind ?? "")) {
          scope.latest = undefined;
          setState(undefined);
          setFrame(undefined);
        }
        throw error;
      } finally {
        if (!current(scope)) await releaseBrowserLease(scope);
      }
    });
    pending.current = execution;
    void execution.finally(() => {
      if (pending.current === execution) pending.current = undefined;
    });
    return execution;
  };
  const request = (method: string, params: Record<string, unknown> = {}, capture = false) => {
    const scope = scopeRef.current;
    if (scope?.client === client && scope?.projectId === project.id && scope.sessionId === sessionId) requestForScope(scope, method, params, capture);
  };
  useEffect(() => {
    if (!client) {
      scopeRef.current = undefined;
      return;
    }
    const scope: BrowserScope = { client, projectId: project.id, sessionId, reviewed: reviewedMachine(client.machine), consumedSelections: new Set(), active: true };
    const hostKey = client.machine.environmentId || client.endpoint;
    scopeRef.current = scope;
    // A replaced screen releases its lease before this scope reads or claims it.
    void Promise.all([cleanup.current, browserCleanupByHost.get(hostKey)]).then(() => {
      if (current(scope)) requestForScope(scope, "browser.status");
    });
    return () => {
      scope.active = false;
      if (scopeRef.current === scope) scopeRef.current = undefined;
      cleanup.current = Promise.resolve(pending.current).then(() => releaseBrowserLease(scope));
      const released = cleanup.current;
      browserCleanupByHost.set(hostKey, released);
      void released.finally(() => {
        if (browserCleanupByHost.get(hostKey) === released) browserCleanupByHost.delete(hostKey);
      });
    };
  }, [client, project.id, sessionId]);
  useEffect(() => {
    if (!active || !state?.controlling) return;
    const currentTime = Date.now();
    setNow(currentTime);
    const remaining = (state.leaseExpiresAt ?? 0) - currentTime;
    if (remaining <= 0) return;
    // Only the expiry changes the controls; no countdown is rendered.
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [active, state?.controlling, state?.leaseExpiresAt]);
  const controlling = active && !!state?.controlling && !!state.leaseId && (state.leaseExpiresAt ?? 0) > Math.max(now, Date.now());
  const busy = action.isPending;
  // Reconnecting re-checks a browser that could not be read, so the screen recovers on its own.
  // The first read waits for a replaced screen's lease release, so only a later reconnect asks here.
  // The live phase: a held blip must still re-check the browser once the socket is back.
  const linked = connection.livePhase === "connected";
  const wasLinked = useRef(linked);
  useEffect(() => {
    if (linked && !wasLinked.current && !browserState) request("browser.status");
    wasLinked.current = linked;
  }, [linked]);
  // There is no manual "take control": the first action claims the shared browser, then runs.
  const act = (method: string, params: Record<string, unknown> = {}, capture = false) => {
    const scope = visibleScope;
    if (!scope || !current(scope) || busy || pending.current) return;
    if (controlling) { requestForScope(scope, method, params, capture); return; }
    void (async () => {
      try {
        await requestForScope(scope, "browser.claim");
        await Promise.resolve();
        if (current(scope) && scope.latest?.leaseId) requestForScope(scope, method, params, capture);
      } catch { /* the claim failure is reported by the action state */ }
    })();
  };
  const input = (params: Record<string, unknown>) => act("browser.input", params, true);
  const prepareSelection = async () => {
    const scope = visibleScope; const selection = state?.selection;
    if (!scope || !current(scope) || !scope.sessionId || !selection || !composerTransfer || !controlling || busy || drafting || scope.consumedSelections.has(selection.id)) return;
    setDrafting(true); setSelectionError(undefined);
    try {
      const checked = await requestForScope(scope, "browser.annotation.read");
      if (!checked?.selection) return;
      const capture = readBrowserCapture(checked.selection, { projectId: scope.projectId, sessionId: scope.sessionId, navigationId: selection.navigationId });
      const isCurrent = () => current(scope) && scope.latest?.navigationId === capture.navigationId && scope.latest.selection?.id === capture.id && capture.id === selection.id &&
        !!scope.latest.controlling && (scope.latest.leaseExpiresAt ?? 0) > Date.now() && !scope.consumedSelections.has(capture.id);
      if (!isCurrent()) throw new Error(copy("Tarayıcıdaki seçim değişti. Öğeyi yeniden seç.", "The browser selection changed. Select the element again."));
      composerTransfer.transfer({ machineId: scope.client.machine.id, sessionId: scope.sessionId, text: "", browserCapture: { capture, comment, isCurrent } });
      scope.consumedSelections.add(capture.id); setPreparedSelection(capture.id); setComment("");
      showToast({ message: copy("Taslağa eklendi", "Added to draft") });
    } catch (error) { if (current(scope)) setSelectionError(error); }
    finally { if (current(scope)) setDrafting(false); }
  };
  // Setup downloads software on the computer: a native confirmation, rechecked against the reviewed computer.
  const reviewSetup = () => {
    const scope = visibleScope;
    if (!scope || !current(scope) || busy) return;
    confirmAction(
      copy("Tarayıcı araçları kurulsun mu?", "Set up browser tools?"),
      copy(
        "Bu işlem seçili bilgisayara tarayıcı araçlarını indirip kurar.",
        "This downloads and installs browser tools on the selected computer.",
      ),
      copy("Tarayıcı araçlarını kur", "Set up browser tools"),
      () => { if (current(scope) && !pending.current) requestForScope(scope, "browser.setup"); },
      copy("Vazgeç", "Cancel"),
      "default",
    );
  };
  // Availability is known before anyone types: connection, Host runtime and who holds the browser.
  const connected = connection.phase === "connected" || connection.phase === "checking";
  const error = actionScope === visibleScope && action.error ? action.error : undefined;
  const errorText = error ? browserErrorMessage(error, lastMethod, copy) : undefined;
  const installed = !!state && state.runtime?.installed !== false;
  const heldElsewhere = installed && !!state?.heldBy && !controlling;
  const opening = busy && (lastMethod === "browser.claim" || lastMethod === "browser.open");
  const openAddress = (address: string) => {
    const target = browserAddress(address);
    if (!target) { setAddressError(copy("example.com gibi bir web adresi yaz.", "Enter a web address such as example.com.")); return; }
    setAddressError(undefined);
    act("browser.open", { url: target }, true);
  };
  const retryStatus = () => request(state?.open ? "browser.frame" : "browser.status");
  // The address field follows the page: a navigation inside the page replaces the typed address.
  const shownUrl = useRef<string | undefined>(undefined);
  useEffect(() => {
    const next = state?.open ? state.url ?? undefined : undefined;
    if (next && next !== shownUrl.current) setUrl(next);
    shownUrl.current = next;
  }, [state?.open, state?.url]);
  // Arriving with an address (a dev server preview) opens it once the browser can take it.
  const autoOpened = useRef(!initialUrl);
  useEffect(() => {
    if (autoOpened.current || !state || !installed || !connected || busy || pending.current) return;
    autoOpened.current = true;
    if (heldElsewhere || !initialUrl) return;
    const target = browserAddress(initialUrl);
    if (target && !(state.open && state.url === target)) openAddress(initialUrl);
  }, [state, installed, connected, busy, heldElsewhere]);
  const pageUrl = state?.open ? state.url : undefined;
  const reloadPage = () => { if (pageUrl) openAddress(pageUrl); };
  const reviewClose = () => {
    const scope = visibleScope;
    if (!scope || !current(scope)) return;
    confirmAction(
      copy("Tarayıcı kapatılsın mı?", "Close the browser?"),
      copy(
        "Bu bilgisayardaki ortak tarayıcı kapanır; diğer kullanıcıların görünümü de etkilenir.",
        "The shared browser on this computer will close, affecting other viewers.",
      ),
      copy("Tarayıcıyı kapat", "Close browser"),
      () => { if (current(scope) && !pending.current) act("browser.close"); },
      copy("Vazgeç", "Cancel"),
    );
  };
  const controls = state && state.runtime?.installed !== false && state.open ? <Row>
    <IconButton label={copy("Yukarı kaydır", "Scroll up")} disabled={busy} onPress={() => input({ kind: "scroll", y: -500 })}><ArrowUp size={iconSize.action} color={colors.accent} /></IconButton>
    <IconButton label={copy("Aşağı kaydır", "Scroll down")} disabled={busy} onPress={() => input({ kind: "scroll", y: 500 })}><ArrowDown size={iconSize.action} color={colors.accent} /></IconButton>
    <ActionMenu label={copy("Klavye", "Keyboard")} trigger={<Keyboard size={iconSize.action} color={colors.accent} />}
      actions={[
        { key: "type", label: copy("Metin yaz", "Type text"), opens: true, disabled: busy, onPress: () => setTyping(true) },
        ...["Tab", "Enter", "Escape"].map(key => ({ key, label: key, disabled: busy, onPress: () => input({ kind: "key", key }) })),
      ]} />
    {sessionId && machine?.capabilities?.includes("browser.annotation") ? <Button tone="quiet" label={state.annotationId ? copy("Seçimi iptal et", "Cancel selection") : copy("Öğe seç", "Select element")}
      disabled={busy || !frame?.navigationId || frame.navigationId !== state.navigationId}
      onPress={() => act(state.annotationId ? "browser.annotation.cancel" : "browser.annotation.start")} /> : null}
    <ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
      pageUrl ? { key: "reload", label: copy("Sayfayı yenile", "Reload page"), icon: <RotateCw />,
        disabled: busy || !connected || heldElsewhere, onPress: reloadPage } : null,
      pageUrl && phoneCanOpen(pageUrl) ? { key: "phone", label: copy("Telefonda aç", "Open on phone"), icon: <ExternalLink />,
        onPress: () => { void Linking.openURL(pageUrl).catch(() => {}); } } : null,
      { key: "close", label: copy("Tarayıcıyı kapat", "Close browser"), destructive: true, reviewed: true, disabled: busy, onPress: reviewClose },
    ].filter((item): item is NonNullable<typeof item> => !!item)} />
  </Row> : undefined;
  let content: ReactNode;
  if (!state) {
    // Nothing to show yet: one region state owns the screen until the browser answers.
    content = !connected
      ? <StateView tone="warning" title={connection.status} description={connection.reason || undefined} />
      : error && !busy
        ? <StateView tone="danger" title={copy("Tarayıcıya ulaşılamadı", "Couldn’t reach the browser")} description={errorText}
            action={{ label: copy("Yeniden dene", "Retry"), onPress: retryStatus }} />
        : <Loading centered label={copy("Tarayıcı kontrol ediliyor…", "Checking the browser…")} />;
  } else if (!installed) {
    const canSetUp = !!machine?.capabilities?.includes("browser.shared.setup");
    content = <StateView illustration="connect-computer"
      title={copy("Tarayıcı kurulu değil", "Browser isn’t set up")}
      description={canSetUp
        ? copy("Sayfaları telefondan açmak için bilgisayara tarayıcı araçlarını kur.", "Set up browser tools on your computer to open pages from your phone.")
        : copy("Tarayıcıyı önce bilgisayardaki bycoda’dan kur.", "Set up the browser in bycoda on your computer first.")}
      action={canSetUp ? {
        label: copy("Tarayıcı araçlarını kur", "Set up browser tools"), busy: state.runtime?.installing,
        onPress: () => { if (!state.runtime?.installing) reviewSetup(); },
      } : undefined} />;
  } else content = <>
    <ActionField label={copy("Adres", "Address")} value={url} placeholder={copy("Adres yaz, ör. example.com", "Enter an address, e.g. example.com")}
      autoCapitalize="none" autoCorrect={false} autoComplete="off" spellCheck={false} keyboardType="url" textContentType="URL" onChangeText={setUrl}
      error={addressError ?? (lastMethod === "browser.open" && !busy ? errorText : undefined)} editable={connected}
      actionLabel={copy("Aç", "Open")} actionIcon={<ArrowRight size={iconSize.action} strokeWidth={2} color={colors.accent} />}
      actionBusy={opening} actionDisabled={busy || !connected || heldElsewhere || !url.trim()}
      onAction={() => openAddress(url)} />
    {/* The computer pill owns the link state; this region shows one state at a time. */}
    {connected && heldElsewhere ? <StateView size="compact" tone="warning"
      title={state.heldBy?.kind === "session"
        ? copy("Ortak tarayıcıyı bir oturum kullanıyor", "A session is using the shared browser")
        : copy("Ortak tarayıcıyı başka bir cihaz kullanıyor", "Another device is using the shared browser")}
      description={copy("Denetimi alırsan onun işlemi durur.", "Taking control stops what it is doing.")}
      action={{ label: copy("Denetimi al", "Take control"), busy: busy && lastMethod === "browser.claim",
        onPress: () => { if (visibleScope && current(visibleScope) && !busy) requestForScope(visibleScope, "browser.claim", { takeover: true }); } }} /> : null}
    {errorText && !busy && !heldElsewhere && lastMethod !== "browser.open" ? <Notice tone="danger" message={errorText} /> : null}
    {/* With no page the empty state owns the rest of the screen, centered (the scroller grows). */}
    {!state.open && !frame?.data ? <StateView illustration="inbox-empty" title={copy("Açık sayfa yok", "No page open")}
      description={copy("Yukarıya bir adres yazarak bilgisayarındaki ortak tarayıcıda aç.", "Enter an address above to open it in the shared browser on your computer.")} /> : null}
    {/* An open page without an image yet (navigation or a failed capture) still says what is happening. */}
    {state.open && !frameUri ? busy
      ? <Loading centered label={copy("Görüntü alınıyor…", "Getting the screen…")} />
      : <StateView size="compact" title={copy("Sayfa görüntüsü yok", "No page image yet")}
          action={{ label: copy("Yenile", "Refresh"), onPress: retryStatus }} /> : null}
    {frame?.data && frameUri ? <RemoteFrame
      uri={frameUri}
      label={copy("Tarayıcı ekranı", "Browser screen")}
      width={frame.width}
      height={frame.height}
      disabled={busy}
      onPress={(point) => state?.annotationId && sessionId && machine?.capabilities?.includes("browser.annotation") ? act("browser.annotation.select", point) : input({ kind: "click", ...point })}
    /> : null}
    {sessionId && state?.selection ? <Disclosure label={copy("Seçilen öğe", "Selected element")}>
      <Notice message={copy("Sayfa verileri güvenilmeyen içeriktir; seçmek veya okumak mesaj göndermez.", "Page data is untrusted content; selecting or reading it does not send a message.")} />
      <Body mono>{state.selection.element.tag} · {state.selection.element.selector}</Body>
      <Body>{state.selection.element.text}</Body><Body mono>{state.selection.pageUrl}</Body>
      {state.selection.limitations.map((limitation, index) => <Body muted key={index}>{limitation}</Body>)}
      <Field label={copy("Yorum", "Comment")} value={comment} onChangeText={setComment} multiline maxLength={4000} editable={!drafting && !busy} />
      <Button tone="quiet" label={copy("Seçimi doğrula", "Verify selection")} disabled={!controlling || busy} onPress={() => request("browser.annotation.read")} />
      <Button label={copy("Seçimi taslağa ekle", "Add selection to draft")} disabled={!composerTransfer || !controlling || busy || drafting || preparedSelection === state.selection.id || !machine?.capabilities?.includes("attachments.ownership.v1")}
        onPress={() => { void prepareSelection(); }} />
      <ErrorText error={selectionError} />
    </Disclosure> : null}
    {state.open && typing ? <Sheet visible title={copy("Metin yaz", "Type text")} size="form" onClose={() => setTyping(false)}>
      <Body muted>{copy("Metin sayfada odaklanmış alana yazılır.", "The text goes into the field that is focused on the page.")}</Body>
      <Field label={copy("Metin", "Text")} value={text} maxLength={4096} multiline onChangeText={setText} />
      <FormActions submitLabel={copy("Metni yaz", "Type text")} disabled={busy || !text}
        onCancel={() => setTyping(false)}
        onSubmit={() => { input({ kind: "text", text }); setTyping(false); }} />
    </Sheet> : null}
  </>;
  return (
    <Screen
      title={copy("Tarayıcı", "Browser")}
      scope={{ computer: machine?.name, project: project.name }}
      footer={controls}
      actions={
        <IconButton label={copy("Ekranı yenile", "Refresh screen")} disabled={busy} onPress={retryStatus}>
          <RefreshCw size={iconSize.action} strokeWidth={2} color={colors.accent} />
        </IconButton>
      }
    >
      {!embedded ? <Stack.Screen options={{ title: copy("Tarayıcı", "Browser") }} /> : null}
      {content}
    </Screen>
  );
}
