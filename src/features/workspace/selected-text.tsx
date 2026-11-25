import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Body, Button, ErrorText, Field, Notice, SelectField, Sheet, showToast } from "@/ui/primitives";
import { ActionGroup } from "@/ui/action-group";
import { LANGUAGES } from "@/localization";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { errorMessage } from "@/ui/error-message";
import { ReaderActionArea } from "@/ui/reader-actions";
import { SelectableMessage } from "@/ui/message-selection";
import type { SelectionActionId } from "@/ui/message-selection-model";
import type { MessageContext } from "@/ui/media-policy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { isAppAccessAllowed, useSecurity } from "@/state/security";
import { usePrivateContentAccess } from "@/ui/private-access";
import { askSideQuestion, type SideChatPort } from "@/features/side-chat/side-chat-client";
import { useComposerTransfer } from "./composer-transfer";
import type { ComposerTransferScope } from "./composer-transfer-model";
import {
  excerptPage,
  quoteExcerpt,
  quoteWithComment,
  selectedExcerpt,
  selectionDisplayText,
  sideQuestionUnsupported,
  translationDraft,
  translationQuestion,
} from "./selected-text-model";

export type SelectionStep = { kind: "select" } | { kind: "quote"; text: string } | { kind: "translate"; text: string };
type SelectionClient = SideChatPort & { assertCurrentAccess?: () => void };
type Role = "user" | "assistant" | "activity";

/** App lock, background, lost focus or revoked private access retire selection output. */
function useSelectionAccess() {
  const permission = usePrivateContentAccess();
  const access = useRef(permission);
  access.current = permission;
  return { permission, allowed: () => {
    const state = useSecurity.getState();
    return isAppAccessAllowed() && state.appState === "active" && state.windowFocused && access.current.allowed && access.current.check();
  } };
}

/**
 * Message text with in-place selection (long-press) and the four selection actions. Add and Copy
 * finish at once with a toast; Quote on an agent reply and Translate continue in a compact sheet.
 * Where in-place selection is unavailable, long-press opens the same sheet at its select step.
 */
export function MessageSelection({ text, context, role, enabled, children }: PropsWithChildren<{
  text: string; context?: MessageContext; role: Role; enabled: boolean;
}>) {
  const copy = useCopy(), bridge = useComposerTransfer(), access = useSelectionAccess();
  const [step, setStep] = useState<SelectionStep | null>(null);
  const sessionId = context?.sessionId;
  const scope = useMemo(() => context && sessionId ? { machineId: context.machineId, sessionId } : null, [context?.machineId, sessionId]);
  const actions: SelectionActionId[] = bridge ? ["add", "quote", "translate", "copy"] : ["translate", "copy"];
  const addToDraft = (value: string) => {
    if (!scope || !bridge || !access.allowed()) return;
    try {
      bridge.transfer({ ...scope, text: value });
      showToast({ message: copy("Mesaja eklendi", "Added to message") });
    } catch (cause) { showToast({ tone: "danger", message: errorMessage(cause, copy) }); }
  };
  const onAction = (action: SelectionActionId, selected: string) => {
    if (!access.allowed()) return;
    if (action === "copy") void copyToClipboard(selected, copy);
    else if (action === "add") addToDraft(selected);
    else if (action === "quote" && role === "assistant") setStep({ kind: "quote", text: selected });
    else if (action === "quote") addToDraft(quoteExcerpt(selected));
    else setStep({ kind: "translate", text: selected });
  };
  return <>
    <SelectableMessage enabled={enabled && !!scope} actions={actions} onAction={onAction} onFallback={() => setStep({ kind: "select" })}>
      {children}
    </SelectableMessage>
    {step && scope ? <SelectedText text={text} scope={scope} client={context?.client} role={role} initial={step} onClose={() => setStep(null)} /> : null}
  </>;
}

async function copyToClipboard(text: string, copy: ReturnType<typeof useCopy>) {
  try {
    await Clipboard.setStringAsync(text);
    showToast({ message: copy("Kopyalandı", "Copied") });
  } catch (cause) { showToast({ tone: "danger", message: errorMessage(cause, copy) }); }
}

/**
 * The selection sheet: deliberate native selection of bounded, read-only source (the fallback for
 * in-place selection), then Add, Quote, Translate or Copy. Nothing is ever sent to the session; a
 * translation is an isolated read-only question when the Host supports it.
 */
export function SelectedText({ text, scope, client, role = "assistant", initial = { kind: "select" }, onClose }: {
  text: string; scope: ComposerTransferScope; client?: SelectionClient; role?: Role; initial?: SelectionStep; onClose: () => void;
}) {
  const copy = useCopy(); const bridge = useComposerTransfer(); const { permission, allowed } = useSelectionAccess();
  const [opening] = useState(() => ({ text, scope: { ...scope } }));
  const [step, setStep] = useState<SelectionStep>(initial);
  const [pageIndex, setPage] = useState(0);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [error, setError] = useState<unknown>(null);
  const [transferred, setTransferred] = useState(false);
  const transferFlight = useRef(false), live = useRef(false), retired = useRef(false);
  const [wasRetired, setRetired] = useState(false);
  const page = useMemo(() => excerptPage(opening.text, pageIndex), [opening.text, pageIndex]);
  const pageOwner = useMemo(() => ({}), [page.index]);
  const current = useRef({ selection, pageIndex, bridge, pageOwner: pageOwner as object | null });
  current.current = { selection, pageIndex, bridge, pageOwner };
  const retireAccess = () => { if (live.current && !allowed()) { retired.current = true; setRetired(true); } };
  useLayoutEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useLayoutEffect(() => useSecurity.subscribe(retireAccess), []);
  useLayoutEffect(retireAccess, [permission]);
  const displayed = useMemo(() => selectionDisplayText(page.text), [page.text]);
  const { height } = useWindowDimensions();
  const mismatch = opening.text !== text || opening.scope.machineId !== scope.machineId || opening.scope.sessionId !== scope.sessionId;
  const changed = wasRetired || mismatch;
  if (changed) { retired.current = true; if (!wasRetired) setRetired(true); }
  let excerpt = "";
  try { excerpt = selectedExcerpt(displayed, selection); } catch { /* No implicit whole-message fallback. */ }
  const usable = () => live.current && !retired.current && allowed() && !changed && !transferred && !transferFlight.current;
  const ownsPage = () => usable() && current.current.pageOwner === pageOwner;
  /** Exactly one draft insertion per opening, into the composer of the session it was opened for. */
  const insert = (value: string) => {
    if (!usable() || !bridge || current.current.bridge !== bridge) return;
    try {
      transferFlight.current = true;
      bridge.transfer({ ...opening.scope, text: value });
      if (live.current) { setTransferred(true); setError(null); showToast({ message: copy("Mesaja eklendi", "Added to message") }); onClose(); }
    } catch (cause) { transferFlight.current = false; if (live.current) setError(cause); }
  };
  const selected = () => {
    if (!ownsPage() || current.current.selection !== selection || current.current.pageIndex !== pageIndex) return null;
    try { return selectedExcerpt(displayed, selection); } catch (cause) { setError(cause); return null; }
  };
  const act = (action: SelectionActionId) => {
    const value = selected();
    if (value === null) return;
    setError(null);
    if (action === "add") insert(value);
    else if (action === "quote" && role === "assistant") setStep({ kind: "quote", text: value });
    else if (action === "quote") insert(quoteExcerpt(value));
    else if (action === "translate") setStep({ kind: "translate", text: value });
    else void copyToClipboard(value, copy).then(() => { if (live.current) onClose(); });
  };
  const move = (next: number) => {
    if (!ownsPage() || !Number.isInteger(next) || next < 0 || next >= page.pages) return;
    const empty = { start: 0, end: 0 };
    current.current.pageOwner = null; current.current.selection = empty; current.current.pageIndex = next;
    setSelection(empty); setPage(next); setError(null);
  };
  const blocked = changed || transferred;
  const stale = changed ? <Notice tone="warning" message={copy("Kaynak veya hedef değişti. Metin seçimini yeniden açın.", "The source or destination changed. Reopen text selection.")} /> : null;
  if (step.kind === "quote")
    return <QuoteSheet text={step.text} blocked={blocked || !bridge} error={error} notice={stale} onInsert={insert} onClose={onClose} />;
  if (step.kind === "translate")
    return <TranslateSheet text={step.text} sessionId={opening.scope.sessionId} client={client} blocked={blocked} canDraft={!!bridge} error={error}
      notice={stale} usable={usable} onInsert={insert} onClose={onClose} />;
  const none = !excerpt || blocked;
  return <Sheet visible title={copy("Metin seç", "Select text")} size="full" onClose={onClose}
    footer={<ReaderActionArea page={page.index} pages={page.pages} onPage={move} navigationDisabled={blocked}
      error={error} status={excerpt ? <Body muted>{copy("Seçilen karakter: {p0}", "Selected characters: {p0}", { p0: excerpt.length })}</Body> : undefined}>
      <ActionGroup label={copy("Seçili metin işlemleri", "Selected text actions")} actions={[
        ...(bridge ? [{ id: "add", label: copy("Ekle", "Add"), disabled: none, onPress: () => act("add") }, { id: "quote", label: copy("Alıntıla", "Quote"), disabled: none, onPress: () => act("quote") }] : []),
        { id: "translate", label: copy("Çevir", "Translate"), disabled: none, onPress: () => act("translate") },
        { id: "copy", label: copy("Kopyala", "Copy"), disabled: none, onPress: () => act("copy") },
      ]} />
    </ReaderActionArea>}>
    {stale}
    <Body muted>{copy("Metnin bir bölümünü seçmek için basılı tutun.", "Touch and hold to select part of the text.")}</Body>
    <Field key={page.index} label={copy("Mesaj metni", "Message text")} value={displayed} readOnly multiline showSoftInputOnFocus={false}
      scrollEnabled onSelectionChange={(event) => { if (!ownsPage()) return; current.current.selection = event.nativeEvent.selection; setSelection(event.nativeEvent.selection); }} style={{ height: Math.max(160, height * 0.32) }} />
  </Sheet>;
}

function QuotePreview({ text }: { text: string }) {
  const { colors } = useMobileTheme();
  return <View style={{ borderStartWidth: 3, borderStartColor: colors.border, paddingStart: space.md, paddingVertical: space.xs }}>
    <Body muted numberOfLines={6}>{text}</Body>
  </View>;
}

/** Desktop "Add citation": the quoted text and an optional comment, inserted into the draft. */
function QuoteSheet({ text, blocked, error, notice, onInsert, onClose }: {
  text: string; blocked: boolean; error: unknown; notice: ReactNode; onInsert: (value: string) => void; onClose: () => void;
}) {
  const copy = useCopy();
  const [comment, setComment] = useState("");
  return <Sheet visible title={copy("Alıntıla", "Quote")} size="form" dirty={!!comment.trim()} onClose={onClose}
    footer={<View style={{ gap: space.xs }}>
      <Button label={copy("Mesaja ekle", "Add to message")} tone="primary" fullWidth disabled={blocked} onPress={() => onInsert(quoteWithComment(text, comment))} />
      <ErrorText error={error} />
    </View>}>
    {notice}
    <QuotePreview text={text} />
    <Field label={copy("Yorum", "Comment")} placeholder={copy("İsteğe bağlı yorum ekleyin…", "Add an optional comment…")} value={comment} onChangeText={setComment} multiline maxLength={4000} />
  </Sheet>;
}

/**
 * Translation as an isolated read-only question (sessions.sideQuestion): the result is shown here
 * with Copy and Add to message, and no turn is added to the session. An older Host, a missing
 * transport or an excerpt longer than one question falls back to a translation request in the draft.
 */
function TranslateSheet({ text, sessionId, client, blocked, canDraft, error, notice, usable, onInsert, onClose }: {
  text: string; sessionId: string; client?: SelectionClient; blocked: boolean; canDraft: boolean; error: unknown;
  notice: ReactNode; usable: () => boolean; onInsert: (value: string) => void; onClose: () => void;
}) {
  const copy = useCopy(); const locale = useLocale();
  const [language, setLanguage] = useState(locale);
  const [state, setState] = useState<{ language: string; busy: boolean; answer?: string; error?: unknown; unsupported?: boolean }>({ language: locale, busy: false });
  const controller = useRef<AbortController | null>(null);
  // Reason: closing the sheet abandons a pending answer so it cannot land in a sheet nobody sees.
  useEffect(() => () => controller.current?.abort(), []);
  const target = LANGUAGES.find((entry) => entry.value === language);
  const question = target ? translationQuestion(text, target.label) : null;
  const isolated = !!client && !!question;
  const result = state.language === language ? state : { language, busy: false };
  const translate = async () => {
    if (!client || !question || !usable() || result.busy) return;
    const abort = new AbortController();
    controller.current?.abort(); controller.current = abort;
    setState({ language, busy: true });
    try {
      client.assertCurrentAccess?.();
      const answer = await askSideQuestion(client, { sessionId, question, history: [] }, abort.signal);
      if (!abort.signal.aborted) setState({ language, busy: false, answer });
    } catch (cause) {
      if (!abort.signal.aborted) setState({ language, busy: false, error: cause, unsupported: sideQuestionUnsupported(cause) });
    } finally { if (controller.current === abort) controller.current = null; }
  };
  const draftRequest = () => { if (target) onInsert(translationDraft(text, target.label)); };
  const fallback = !isolated || result.unsupported;
  const footer = result.answer !== undefined
    ? <ActionGroup label={copy("Çeviri işlemleri", "Translation actions")} actions={[
      { id: "copy", label: copy("Kopyala", "Copy"), disabled: blocked, onPress: () => { if (usable()) void copyToClipboard(result.answer!, copy); } },
      ...(canDraft ? [{ id: "add", label: copy("Mesaja ekle", "Add to message"), disabled: blocked, onPress: () => onInsert(result.answer!) }] : []),
    ]} />
    : fallback
      ? <Button label={copy("Çeviri isteğini taslağa ekle", "Add translation request to draft")} tone="primary" fullWidth disabled={blocked || !canDraft || !target} onPress={draftRequest} />
      : <Button label={copy("Çevir", "Translate")} tone="primary" fullWidth busy={result.busy} disabled={blocked || !target} onPress={() => void translate()} />;
  return <Sheet visible title={copy("Çevir", "Translate")} size="form" dismissible={!result.busy} onClose={onClose}
    footer={<View style={{ gap: space.xs }}>{footer}<ErrorText error={error} /></View>}>
    {notice}
    <QuotePreview text={text} />
    <SelectField label={copy("Hedef dil", "Translate to")} value={language} options={LANGUAGES} onChange={setLanguage} />
    {result.answer !== undefined ? <Body selectable>{result.answer}</Body> : null}
    {result.unsupported
      ? <Body muted>{copy("Bu bilgisayar ayrı çeviriyi desteklemiyor. İsteği taslağa ekleyebilirsiniz.", "This computer does not support separate translation. You can add the request to your draft.")}</Body>
      : <ErrorText error={result.error} />}
  </Sheet>;
}
