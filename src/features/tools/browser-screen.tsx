import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Stack } from "expo-router";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useHostClient, useHostReadActive } from "@/state/queries";
import { useAsyncAction } from "@/state/actions";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import type { HostProject } from "@/domain/types";
import { Body, Button, ConfirmationCard, Disclosure, ErrorText, Field, IconButton, MutationState, Notice, Row, Screen } from "@/ui/primitives";
import { RemoteFrame } from "@/ui/remote-frame";
import { ActionField } from "@/ui/action-field";
import { ActionMenu } from "@/ui/overflow-menu";
import Keyboard from "lucide-react-native/icons/keyboard";
import { useCopy } from "@/ui/copy";
import { DATA_SAVER_FRAME_QUALITY, useDataSaverActive } from "@/state/data-saver";
import { useMobileTheme } from "@/ui/theme";
import type { BrowserState } from "./types";
import { readBrowserCapture } from "./browser-annotation-model";
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
  return <BrowserScreenBody key={clientIdentity(client)} client={client}
    project={project} sessionId={sessionId} embedded={embedded} drafts={drafts} updateDraft={updateDraft} />;
}

/** One serialized request path preserves the shared browser's control lease. */
function BrowserScreenBody({ project, sessionId, client, drafts, updateDraft, embedded }: BrowserProps & {
  client: ReturnType<typeof useHostClient>; drafts: BrowserDrafts; updateDraft: (field: keyof BrowserDrafts, value: string) => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const active = useHostReadActive();
  const machine = useActiveMachine();
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
  const setUrl = (value: string) => editDraft("url", value);
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
  const [review, setReview] = useState<{ scope: BrowserScope; method: "browser.setup" | "browser.close" }>();
  const current = (scope: BrowserScope) => scope.active && scopeRef.current === scope &&
    isReviewedMachine(scope.reviewed, useMachines.getState());
  // Hide previous-host data on the render that changes scope, before effects run.
  const activeScope = scopeRef.current;
  const visibleScope = activeScope?.client === client && activeScope?.projectId === project.id && activeScope?.sessionId === sessionId
    && current(activeScope) ? activeScope : undefined;
  const state = visibleScope ? browserState : undefined;
  const frame = visibleScope ? browserFrame : undefined;
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
  const input = (params: Record<string, unknown>) => {
    if (controlling && !busy) request("browser.input", params, true);
  };
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
      if (!isCurrent()) throw new Error("The browser selection changed. Select the element again.");
      composerTransfer.transfer({ machineId: scope.client.machine.id, sessionId: scope.sessionId, text: "", browserCapture: { capture, comment, isCurrent } });
      scope.consumedSelections.add(capture.id); setPreparedSelection(capture.id); setComment("");
    } catch (error) { if (current(scope)) setSelectionError(error); }
    finally { if (current(scope)) setDrafting(false); }
  };
  const reviewCard = review && review.scope === visibleScope ? (
    <ConfirmationCard
      message={
        review.method === "browser.setup"
          ? copy(
              "Bu işlem seçili bilgisayara tarayıcı araçlarını indirip kurar.",
              "This downloads and installs browser tools on the selected computer.",
            )
          : copy(
              "Bu bilgisayardaki ortak tarayıcı kapanır; diğer kullanıcıların görünümü de etkilenir.",
              "The shared browser on this computer will close, affecting other viewers.",
            )
      }
      tone={review.method === "browser.setup" ? "primary" : "danger"}
      confirmLabel={copy("Onayla", "Confirm")}
      cancelLabel={copy("Vazgeç", "Cancel")}
      busy={busy}
      disabled={
        !current(review.scope) ||
        (review.method === "browser.close" && !controlling)
      }
      onCancel={() => setReview(undefined)}
      onConfirm={() => {
        if (
          !current(review.scope) ||
          busy ||
          (review.method === "browser.close" && !controlling)
        )
          return;
        requestForScope(review.scope, review.method);
        setReview(undefined);
      }}
    />
  ) : null;
  const controls = state && state.runtime?.installed !== false ? <Row>
    <Button label={controlling ? copy("Kontrolü bırak", "Release control") : copy("Kontrolü al", "Take control")}
      tone={controlling ? "quiet" : "primary"} disabled={busy} onPress={() => request(controlling ? "browser.release" : "browser.claim")} />
    {state.open ? <>
      <IconButton label={copy("Yukarı kaydır", "Scroll up")} disabled={!controlling || busy} onPress={() => input({ kind: "scroll", y: -500 })}><ArrowUp size={20} color={colors.muted} /></IconButton>
      <IconButton label={copy("Aşağı kaydır", "Scroll down")} disabled={!controlling || busy} onPress={() => input({ kind: "scroll", y: 500 })}><ArrowDown size={20} color={colors.muted} /></IconButton>
      <ActionMenu label={copy("Klavye", "Keyboard")} trigger={<Keyboard size={20} color={colors.muted} />}
        actions={["Tab", "Enter", "Escape"].map(key => ({ key, label: key, disabled: !controlling || busy, onPress: () => input({ kind: "key", key }) }))} />
      {sessionId && machine?.capabilities?.includes("browser.annotation") ? <Button tone="quiet" label={state.annotationId ? copy("Seçimi iptal et", "Cancel selection") : copy("Öğe seç", "Select element")}
        disabled={!controlling || busy || !frame?.navigationId || frame.navigationId !== state.navigationId}
        onPress={() => request(state.annotationId ? "browser.annotation.cancel" : "browser.annotation.start")} /> : null}
      {!(review?.method === "browser.close" && review.scope === visibleScope) ? <ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[{
        key: "close", label: copy("Tarayıcıyı kapat", "Close browser"), destructive: true, disabled: !controlling || busy,
        onPress: () => { if (visibleScope && current(visibleScope)) setReview({ scope: visibleScope, method: "browser.close" }); },
      }]} /> : null}
    </> : null}
  </Row> : undefined;
  return (
    <Screen
      title={copy("Tarayıcı", "Browser")}
      subtitle={[machine?.name, project.name].filter(Boolean).join(" · ")}
      footer={controls}
      actions={
        <IconButton label={copy("Ekranı yenile", "Refresh screen")} disabled={busy} onPress={() => request(state?.open ? "browser.frame" : "browser.status")}>
          <RefreshCw size={22} strokeWidth={2} color={colors.accent} />
        </IconButton>
      }
    >
      {!embedded ? <Stack.Screen options={{ title: copy("Tarayıcı", "Browser") }} /> : null}
      {state?.runtime && !state.runtime.installed && !(review?.method === "browser.setup" && review.scope === visibleScope) ? <Notice message={copy("Tarayıcıyı önce bilgisayardaki bycoda’dan kur.", "Set up the browser in bycoda on your computer first.")} /> : null}
      {state?.runtime && !state.runtime.installed && machine?.capabilities?.includes("browser.shared.setup") && !(review?.method === "browser.setup" && review.scope === visibleScope) ? <Button
        label={copy("Tarayıcı araçlarını kur", "Set up browser tools")} busy={state.runtime.installing} disabled={busy || state.runtime.installing}
        onPress={() => { if (visibleScope && current(visibleScope)) setReview({ scope: visibleScope, method: "browser.setup" }); }} /> : null}
      {review?.method === "browser.setup" ? reviewCard : null}
      <MutationState mutation={actionScope === visibleScope ? action : {}} pending={review?.scope === visibleScope ? undefined : copy("Yükleniyor", "Loading")} />
      {state && state.runtime?.installed !== false ? <>
        <ActionField label={copy("Adres", "URL")} value={url} placeholder={state?.url ?? "https://"}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={setUrl}
          actionLabel={copy("Aç", "Open")} actionDisabled={!controlling || busy || !url.trim()}
          onAction={() => request("browser.open", { url: url.trim() }, true)} />
        {state?.url ? <Body muted numberOfLines={2}>{state.url}</Body> : null}
        {frame?.data ? <RemoteFrame
          uri={`data:${frame.mimeType ?? "image/jpeg"};base64,${frame.data}`}
          label={copy("Tarayıcı ekranı", "Browser screen")}
          width={frame.width}
          height={frame.height}
          disabled={!controlling || busy}
          onPress={(point) => state?.annotationId && sessionId && machine?.capabilities?.includes("browser.annotation") ? request("browser.annotation.select", point) : input({ kind: "click", ...point })}
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
          {preparedSelection === state.selection.id ? <Notice message={copy("Seçim taslağa eklendi.", "Selection added to draft.")} /> : null}
          <ErrorText error={selectionError} />
        </Disclosure> : null}
        {state?.open ? <>
          {review?.method === "browser.close" && review.scope === visibleScope ? reviewCard : null}
          <Disclosure label={copy("Metin", "Text")}>
            <Field label={copy("Metin", "Text")} value={text} maxLength={4096} multiline onChangeText={setText} />
            <Button label={copy("Metni yaz", "Type text")} disabled={!controlling || busy || !text} onPress={() => input({ kind: "text", text })} />
          </Disclosure>
        </> : null}
        </> : null}
      </Screen>
    );
  }
