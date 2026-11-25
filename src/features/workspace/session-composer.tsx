import { useMobileTheme } from "@/ui/theme";
import { use, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Keyboard, ScrollView, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Plus from "lucide-react-native/icons/plus";
import X from "lucide-react-native/icons/x";
import Square from "lucide-react-native/icons/square";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import { randomUUID } from "expo-crypto";
import { useHostClient } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { registerWorkspaceDraft } from "./draft-guard";
import { useLocalDraft } from "./use-local-draft";
import type { SessionComposerProps } from "./session-types";
import { SessionKeyboardSpace } from "./session-keyboard-frame";
import {
  decodeComposerDraft,
  emptyComposerDraft,
  encodeComposerDraft,
  sameComposerContent,
  queuedComposerDraft,
  crewIntentForDraft,
  retainQueuedComposerIntent,
  type QueuedComposerDraft,
} from "./composer-draft";
import { useComposerSuggestions } from "./use-composer-suggestions";
import { useComposerDelivery } from "./use-composer-delivery";
import { useComposerAttachments } from "./use-composer-attachments";
import { useDraftAppend } from "./use-draft-append";
import { useDictation } from "./use-dictation";
import { ComposerDictationButton, ComposerDictationFeedback } from "./composer-dictation";
import { appendDictation } from "./dictation-model";
import { useMounted } from "@/state/use-mounted";
import { ComposerSuggestions } from "./composer-suggestions";
import { ComposerAttachments } from "./composer-attachments";
import { ComposerLinks } from "./composer-links";
import { composerLinks } from "./attachment-presentation";
import { removeStagedFile, stageBrowserCapture } from "./attachment-files";
import { ATTACHMENT_COUNT, type StagedAttachment } from "./attachment-model";
import {
  attachmentReleases,
  composerDraftKey,
  supportsAttachmentOwnership,
} from "./attachment-ownership";
import { ChatCircleAction } from "@/ui/chat-controls";
import { ComposerModeChip } from "./composer-mode-controls";
import { activeComposerMode, setComposerMode, type ComposerMode } from "./composer-mode";
import { ChatComposer } from "@/ui/chat-composer";
import { ComposerModelChip } from "./composer-model-chip";
import { ComposerActionsProvider } from "@/ui/composer-actions";
import { composerInputLimits, composerNeedsInlineActions, composerPrefixMaximum, composerSuggestionLimits } from "@/ui/chat-composer-model";
import { haptic } from "@/ui/motion";
import {
  composerCommand,
  queuedComposerMessage,
  validateNoteDelivery,
  type ComposerDelivery,
} from "./composer-delivery";
import { ComposerSendButton } from "./composer-send-button";
import { busyAlternateMode } from "./busy-send";
import { useBusySend } from "@/state/busy-send";
import { useSessionQueue } from "./use-session-queue";
import { SessionQueue } from "./session-queue";
import { SessionAgents } from "./session-agents";
import { composerDeliveryError } from "./composer-delivery-copy";
import {
  expandTemplateTrigger,
  insertTemplate,
} from "@/features/management/templates/template-model";
import { useTemplateHydration, useTemplates } from "@/features/management/templates/template-store";
import { useComposerTransfer } from "./composer-transfer";
import { appendComposerTransfer } from "./composer-transfer-model";
import { captureSessionAuthority, sessionIntent } from "@/domain/session-authority";
import { ComposerSheets } from "./composer-sheets";
import { ComposerNotices } from "./composer-notices";
import { ComposerNoteCard } from "./composer-note-card";
import { ComposerContextRing, contextNeedsAttention } from "./composer-context-meter";
import { composerContextReading } from "./composer-context";
import { openModelSheet } from "./composer-model-sheet";
import { useIsFocused } from "expo-router/react-navigation";
import { useKeyCommand } from "../../../modules/bycoda-key-commands";
import { useCommandPalette } from "@/features/keyboard/keyboard-context";
import { useKeyboardPreferences, useKeyboardPreferenceHydration } from "@/features/keyboard/keyboard-preferences";
import { useAccount } from "@/features/account/ui/account-context";
import { OUTBOX_CAPABILITY, offlineSendFailure, outboxDraftIdentity, sameOutboxDraft, type OutboxRow } from "../outbox/model/outbox";
import { sendOutbox } from "../outbox/runtime/store";
import { lockOutbox } from "../outbox/runtime/delivery";
import { registerOutboxEditor } from "../outbox/runtime/composer-edit";
import { cleanOutboxFiles } from "../outbox/runtime/custody";
import { SideChatSheet } from "../side-chat/side-chat-sheet";
import { composerCrewHandles, deliverComposerCrews, resolveComposerCrews } from "./composer-crew-delivery";
import { MAX_DELEGATIONS } from "../../../../src/features/sessions/model/crewMentions";
import { composerWorkItemContext } from "./composer-work-item-context";
import { composerNoteContext } from "./composer-note-context";

export function SessionComposer({
  scope,
  session,
  blocked,
  busy,
  onCommand,
  outsidePressRef,
}: SessionComposerProps & { onOpenSettings?: () => void; outsidePressRef?: RefObject<(() => void) | null> }) {
  const { colors } = useMobileTheme();
  useTemplateHydration();
  const copy = useCopy();
  useKeyboardPreferenceHydration();
  const enterSends = useKeyboardPreferences((state) => state.hydrated && !state.error && state.enterSends);
  const routeFocused = useIsFocused();
  // The toolbar is always visible, so focus only drives hardware key commands, not layout.
  const [inputFocused, setInputFocused] = useState(false);
  const palette = useCommandPalette();
  const client = useHostClient();
  const account = useAccount();
  const outboxIntent = useRef<string | null>(null);
  const queue = useSessionQueue(scope, session?.status === "running");
  const submission = useRef(false);
  const queuedDraft = useRef<QueuedComposerDraft | null>(null);
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const availableHeight = use(SessionKeyboardSpace);
  const [selectedRange, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [picker, setPicker] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [draftDetailsOpen, setDraftDetailsOpen] = useState(false);
  const [templatePicker, setTemplatePicker] = useState(false);
  const templateDestination = useRef<{ machineId: string; sessionId: string } | null>(null);
  const [retryingDraft, setRetryingDraft] = useState(false);
  // The ref is the synchronous double-tap guard; the state only drives the busy indicator.
  const stopping = useRef(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [localError, setLocalError] = useState<unknown>(null);
  const mounted = useMounted();
  const [prefixHeight, measurePrefix] = useComposerHeight();
  const [measuredOperationsHeight, measureOperations] = useComposerHeight();
  const [footerHeight, measureFooter] = useComposerHeight();
  const [toolbarHeight, measureToolbar] = useComposerHeight();
  const shortFrame = composerNeedsInlineActions(availableHeight, fontScale, toolbarHeight, measuredOperationsHeight);
  const operationsHeight = shortFrame ? 0 : measuredOperationsHeight;
  const [suggestionsHeight, measureSuggestions] = useComposerHeight();
  const draftKey = composerDraftKey(scope.machineId, scope.sessionId);
  const draft = useLocalDraft(draftKey, decodeComposerDraft, encodeComposerDraft);
  const { ready, isStored, persist, load, setValue, valueRef, error } = draft;
  const composerTransfer = useComposerTransfer();
  const value = draft.value ?? emptyComposerDraft();
  const prompt = value.text;
  const selection = selectedRange ?? { start: prompt.length, end: prompt.length };
  const links = useMemo(() => composerLinks(prompt), [prompt]);
  const activeMode = activeComposerMode(prompt);
  const hasPrefix = !!(value.noteCard || value.attachments.length || links.length || activeMode);
  const prefixMaximum = composerPrefixMaximum(
    windowHeight, availableHeight, fontScale, operationsHeight, footerHeight, toolbarHeight,
  );
  const showInlinePrefix = hasPrefix && !shortFrame && !draftDetailsOpen && prefixMaximum >= metrics.touchTarget;
  const measuredPrefix = showInlinePrefix ? prefixHeight : 0;
  const suggestionLimits = composerSuggestionLimits(
    windowHeight, availableHeight, fontScale, measuredPrefix + operationsHeight, footerHeight, toolbarHeight,
  );
  const busyPreferred = useBusySend((state) => state.mode);
  const delivery = useComposerDelivery({
    session,
    client,
    queueSupported: queue.supported,
    busyPreferred,
  });
  const { mode, running, desktopOwned, canSteer } = delivery;
  const noteContextSupported =
    client?.machine.id === scope.machineId &&
    !!client.machine.capabilities?.includes("sessions.noteContext.v1");
  let noteError: Error | undefined;
  try {
    validateNoteDelivery(value.noteCard, mode, prompt, noteContextSupported);
  } catch (cause) {
    noteError = cause as Error;
  }
  useEffect(
    () => (ready && !isStored ? registerWorkspaceDraft(draftKey, () => persist()) : undefined),
    [ready, isStored, draftKey, persist],
  );
  const openSideQuestion = () => {
    if (blocked || !client?.machine.capabilities?.includes("sessions.sideQuestion")) return false;
    Keyboard.dismiss();
    setSideOpen(true);
    return true;
  };
  const suggestions = useComposerSuggestions({
    session,
    prompt,
    selection,
    setSelection,
    setValue,
    focused: routeFocused && inputFocused && ready && !picker && !templatePicker && !draftDetailsOpen && !sideOpen,
    onSideQuestion: openSideQuestion,
  });
  const { token } = suggestions;
  useLayoutEffect(() => {
    if (!outsidePressRef) return;
    outsidePressRef.current = token ? suggestions.close : null;
    return () => { outsidePressRef.current = null; };
  }, [outsidePressRef, suggestions.close, token]);
  const suggestionPrefix = token ? suggestionsHeight + (measuredPrefix > 0 ? space.xs : 0) : 0;
  const inputLimits = composerInputLimits(
    windowHeight,
    availableHeight,
    fontScale,
    measuredPrefix + operationsHeight + suggestionPrefix,
    footerHeight,
    toolbarHeight,
  );
  const maximumInputHeight = inputLimits.maximum;
  const showSuggestions = !!token;
  const uploads = useComposerAttachments({
    scope,
    client,
    draft,
    submission,
    mounted,
    setLocalError,
  });
  const { uploading, picking, transfers, transfer, claimedFiles } = uploads;
  useEffect(() => {
    // Recover write-ahead identity after process death before composer cleanup.
    if (!ready) return;
    let current = true;
    void sendOutbox.read(scope.machineId, scope.sessionId).then(async rows => {
      if (!current || submission.current || !valueRef.current) return;
      for (const delivered of rows.filter(row => row.status === "delivered" && !sameOutboxDraft(row.draft, valueRef.current!))) {
        await sendOutbox.remove(delivered);
        await cleanOutboxFiles(delivered).catch(() => {});
      }
      const row = rows.find(row => row.status !== "dropped" && sameOutboxDraft(row.draft, valueRef.current!));
      if (!row) return;
      outboxIntent.current = row.id;
      if (row.status === "waiting" || row.status === "delivered") {
        setValue(emptyComposerDraft());
        await persist();
        if (row.status === "delivered") {
          await sendOutbox.remove(row);
          await cleanOutboxFiles(row).catch(() => {});
        }
        outboxIntent.current = null;
      }
    }).catch(cause => { if (current) setLocalError(cause); });
    return () => { current = false; };
  }, [scope.machineId, scope.sessionId, ready, persist, setValue, valueRef]);
  useEffect(() => {
    // The composer remains sole draft writer, including explicit outbox Edit.
    return registerOutboxEditor(scope, async (row) => {
      if (!ready || submission.current || transfer.current || row.accountId !== account.device?.id ||
        account.status !== "signedIn" || useMachines.getState().activeId !== scope.machineId ||
        useMachines.getState().machines.find(machine => machine.id === scope.machineId)?.environmentId !== row.environmentId)
        throw new Error(copy("Taslak şu anda düzenlenemiyor.", "Draft cannot be edited right now."));
      const current = valueRef.current ?? emptyComposerDraft();
      if (current.text || current.attachments.length || current.noteCard)
        throw new Error(copy("Bekleyen mesajı düzenlemeden önce mevcut taslağı kaydet veya temizle.", "Save or clear the current draft before editing the waiting message."));
      outboxIntent.current = row.id;
      const restored = { ...row.draft, clientMessageId: row.id };
      setValue(restored);
      await persist();
    });
  }, [scope.machineId, scope.sessionId, ready, account.status, account.device?.id, persist, setValue, valueRef, copy]);
  useDraftAppend({
    draftKey,
    scopeKey: `${scope.machineId}:${scope.sessionId}`,
    ready,
    draft,
    mounted,
    setLocalError,
    locked: () => submission.current || !!transfer.current,
  });
  const dictation = useDictation({
    machineId: scope.machineId,
    sessionId: scope.sessionId,
    locked: !ready || busy || uploading,
    onText: (spoken) => {
      if (submission.current || transfer.current) throw new Error(copy("Gönderim sürerken sesle yazılamaz.", "Wait for the current send or upload to finish."));
      setValue((current) => {
        const base = current ?? emptyComposerDraft();
        return { ...base, text: appendDictation(base.text, spoken) };
      });
    },
  });
  const submit = async (override?: ComposerDelivery) => {
    // Draft mode saves the message on the Host, whatever the delivery mode is.
    const sendMode =
      activeComposerMode(valueRef.current?.text ?? "") === "draft" ? "send" : (override ?? mode);
    if (!ready || blocked || busy || uploading || submission.current || !client || !session) return;
    if (sendMode === "queue" && (!queue.supported || (!!queue.error && !client.machine.capabilities?.includes(OUTBOX_CAPABILITY)) || queue.changing)) return;
    const currentDraft = valueRef.current;
    if (
      !currentDraft ||
      (!currentDraft.text.trim() && !currentDraft.attachments.length && !currentDraft.noteCard)
    )
      return;
    let submitted = currentDraft;
    const crewHandles = composerCrewHandles(submitted.text);
    if (crewHandles.length) {
      const reason = crewHandles.length > MAX_DELEGATIONS
        ? copy("Bir mesajda en fazla beş ekip veya ajana görev verin.", "Delegate to at most five crews or agents per message.")
        : !client.machine.capabilities?.includes("crews.v1")
          ? copy("Ekip ve ajanlara görev verme bu bilgisayarda kullanılamıyor.", "Crew and agent delegation is unavailable on this computer.")
          : sendMode !== "send" || running || activeComposerMode(submitted.text) === "draft"
            ? copy("Ekip veya ajana görev vermek için bu mesajı çalışma bitince doğrudan gönderin.", "Send this message directly after the run finishes to delegate to a crew or agent.")
            : undefined;
      if (reason) {
        setLocalError(new Error(reason));
        return;
      }
    }
    let savedMessageId: string | undefined;
    try {
      if (
        client.machine.id !== scope.machineId ||
        useMachines.getState().activeId !== scope.machineId
      )
        return;
      validateNoteDelivery(submitted.noteCard, sendMode, submitted.text, noteContextSupported);
      captureSessionAuthority(session);
      savedMessageId = outboxDraftIdentity(submitted);
    } catch (cause) {
      setLocalError(cause);
      return;
    }
    if (
      /^\s*\/compact\s*$/.test(submitted.text) &&
      (sendMode === "steer" || submitted.attachments.length)
    ) {
      setLocalError(
        new Error(
          copy(
            "Bağlamı sıkıştırmadan önce çalışmanın bitmesini bekle ve ekleri kaldır.",
            "Wait for the run to finish and remove attachments before compacting.",
          ),
        ),
      );
      return;
    }
    if (/^\s*\/plan\s*$/.test(submitted.text)) {
      setLocalError(
        new Error(
          copy("/plan komutundan sonra yapmak istediğini yaz.", "Describe the work after /plan."),
        ),
      );
      return;
    }
    const controller = new AbortController();
    // Capture before uploads, attachment persistence or queue baseline reads.
    const intendedSession = { ...session, ...captureSessionAuthority(session) };
    const clientMessageId = outboxIntent.current ?? savedMessageId ?? (sendMode === "queue" ? queuedDraft.current?.id : undefined) ?? randomUUID();
    outboxIntent.current = clientMessageId;
    const outboxSupported = client.machine.capabilities?.includes(OUTBOX_CAPABILITY) && account.status === "signedIn" && !!account.device?.id;
    const unlockOutbox = outboxSupported ? lockOutbox(scope) : undefined;
    if (outboxSupported && !unlockOutbox) return;
    let outboxRow: OutboxRow | undefined;
    let acceptedOutbox = false;
    if (sendMode === "queue")
      queuedDraft.current = queuedComposerDraft(
        queuedDraft.current,
        submitted,
        randomUUID,
        intendedSession,
      );
    if (sendMode === "queue" && queuedDraft.current) queuedDraft.current.id = clientMessageId;
    submission.current = true;
    uploads.begin(controller);
    setLocalError(null);
    try {
      let contextReplay: string | undefined;
      if (crewHandles.length) {
        const check = () => {
          if (controller.signal.aborted || !mounted.current ||
              useMachines.getState().activeId !== scope.machineId || !sameComposerContent(valueRef.current, submitted!))
            throw new Error(copy("Taslak veya bilgisayar değişti. Göndermeden önce yeniden inceleyin.", "The draft or computer changed. Review it before sending."));
          client.assertCurrentAccess?.();
        };
        const resolved = await resolveComposerCrews(client, intendedSession.projectId, crewHandles, controller.signal);
        check();
        const missing = resolved.find(({ target }) => !target);
        if (missing) throw new Error(copy("Ekip veya ajan bulunamadı: @{p0}", "Crew or agent not found: @{p0}", { p0: missing.handle }));
        const targets = resolved.flatMap(({ target }) => target ? [target] : []);
        const keys = targets.map(({ kind, id }) => `${kind}:${id}`);
        const intent = crewIntentForDraft(submitted, client.machine.environmentId, keys, randomUUID);
        if (intent.targets.some((key, index) => key !== keys[index]) || intent.targets.length !== keys.length)
          throw new Error(copy("Ekip veya ajan değişti. Mesajdaki bahsetmeyi yeniden seçin.", "The crew or agent changed. Select the mention again."));
        submitted = { ...submitted, crewIntent: intent };
        setValue(submitted);
        // Keep the write identity durable before either Host delegation can be accepted.
        await persist();
        contextReplay = await deliverComposerCrews(client, {
          projectId: intendedSession.projectId,
          sessionId: scope.sessionId,
          text: submitted.text,
          intentId: intent.id,
        }, targets, controller.signal, check);
      }
      // Native slash arguments belong to the provider. Ordinary and planned
      // sends can carry tracker data separately from the exact visible prompt.
      if (sendMode === "send" && submitted.text.includes("@") &&
          (!/^\s*\//.test(submitted.text) || activeComposerMode(submitted.text) === "plan")) {
        const inputs = [client, intendedSession.projectId, submitted.text, controller.signal] as const;
        const references = await Promise.all([
          client.machine.capabilities?.includes("inbox.providers.desktop") ? composerWorkItemContext(...inputs) : undefined,
          noteContextSupported ? composerNoteContext(...inputs) : undefined,
        ]);
        contextReplay = [contextReplay, ...references].filter(Boolean).join("\n\n") || undefined;
        if (controller.signal.aborted || !mounted.current) return;
      }
      if (outboxSupported) {
        const references = submitted.attachments.map(({ uri: _uri, claimId: _claimId, ...reference }) => reference);
        const command = sendMode === "queue"
          ? queuedComposerMessage(clientMessageId, { ...intendedSession, authorityGeneration: queuedDraft.current!.authorityGeneration }, submitted.text, references, submitted.noteCard)
          : composerCommand(intendedSession, sendMode, submitted.text, references, submitted.noteCard, contextReplay);
        outboxRow = {
          id: clientMessageId, machineId: scope.machineId, sessionId: scope.sessionId,
          projectId: intendedSession.projectId,
          environmentId: client.machine.environmentId, accountId: account.device!.id,
          createdAt: Date.now(), mode: sendMode, draft: submitted,
          command: { ...command, sessionId: scope.sessionId, clientMessageId },
          model: { harness: intendedSession.session.harness, model: intendedSession.session.model,
            modelSettings: { ...intendedSession.session.modelSettings }, providerAccountId: intendedSession.session.providerAccountId },
          status: "blocked", attempted: false,
        };
        // Write ahead: a process interruption retains the original send identity.
        await sendOutbox.put(outboxRow);
      }
      if (sendMode === "queue") {
        setValue((current) =>
          current ? retainQueuedComposerIntent(current, queuedDraft.current!) : current,
        );
        await persist();
        if (controller.signal.aborted || !mounted.current) return;
      }
      const attachments = [];
      for (const file of submitted.attachments)
        attachments.push(await uploads.upload(file, controller));
      if (controller.signal.aborted || !mounted.current) return;
      // Stage before delivery: a later storage failure cannot mask an accepted send.
      // Until draft removal is durable, the saved draft blocks this tombstone.
      await attachmentReleases.stage(
        client,
        scope.sessionId,
        submitted.attachments.map((file) => claimedFiles.current.get(file.id) ?? file),
      );
      if (outboxRow) {
        outboxRow.draft = { ...submitted, attachments: submitted.attachments.map(file => claimedFiles.current.get(file.id) ?? file) };
        outboxRow.command = { ...outboxRow.command, attachments };
        outboxRow.attempted = true;
        await sendOutbox.update(outboxRow);
      }
      if (sendMode === "queue") {
        await queue.enqueue(
          { ...queuedComposerMessage(
            queuedDraft.current!.id,
            { ...intendedSession, authorityGeneration: queuedDraft.current!.authorityGeneration },
            submitted.text,
            attachments,
            submitted.noteCard,
          ), ...(outboxSupported ? { clientMessageId } : {}) },
        );
      } else
        await onCommand({
          ...composerCommand(
            intendedSession,
            sendMode,
            submitted.text,
            attachments,
            submitted.noteCard,
            contextReplay,
          ),
          ...(outboxSupported ? { clientMessageId } : {}),
        });
      if (outboxRow) {
        acceptedOutbox = true;
        outboxRow.status = "delivered";
        await sendOutbox.update(outboxRow);
      }
      if (!mounted.current) return;
      if (sameComposerContent(valueRef.current, submitted)) {
        setValue(emptyComposerDraft());
        setSelection({ start: 0, end: 0 });
      } else
        setValue((current) =>
          current
            ? {
                ...current,
                ...(current.noteCard === submitted.noteCard ? { noteCard: undefined } : {}),
                attachments: current.attachments.filter(
                  (file) => !submitted.attachments.some((sent) => sent.id === file.id),
                ),
              }
            : current,
        );
      await persist();
      if (outboxRow) await sendOutbox.remove(outboxRow);
      outboxIntent.current = null;
      submitted.attachments.forEach((file) => {
        removeStagedFile(file);
        claimedFiles.current.delete(file.id);
      });
      // Remote release failure must not turn an accepted send into a send retry.
      void attachmentReleases.flush(client).catch(() => {});
      haptic.success();
    } catch (cause) {
      if (outboxRow && offlineSendFailure(cause) && !controller.signal.aborted) {
        try {
          outboxRow.draft = { ...submitted, attachments: submitted.attachments.map(file => claimedFiles.current.get(file.id) ?? file) };
          outboxRow.status = "waiting";
          await sendOutbox.update(outboxRow);
          if (mounted.current && sameComposerContent(valueRef.current, submitted)) {
            setValue(emptyComposerDraft());
            setSelection({ start: 0, end: 0 });
            await persist();
            outboxIntent.current = null;
          }
          if (mounted.current) setLocalError(null);
        } catch (storageError) {
          if (mounted.current) setLocalError(storageError);
        }
      } else {
        if (outboxRow && !acceptedOutbox) await sendOutbox.remove(outboxRow).catch(() => {});
        if (mounted.current) setLocalError(cause);
      }
    } finally {
      unlockOutbox?.();
      submission.current = false;
      uploads.end();
    }
  };
  const unavailable = blocked || busy || uploading || picking || !ready || queue.changing;
  useEffect(
    () =>
      composerTransfer?.register((request) => {
        if (request.noteCard && !noteContextSupported)
          throw new Error(
            "Update bycoda on this computer to send note context. Your draft is preserved.",
          );
        const current = valueRef.current ?? emptyComposerDraft();
        const next = appendComposerTransfer(
          current,
          request,
          scope,
          useMachines.getState().activeId,
          !unavailable &&
            !submission.current &&
            !transfer.current &&
            !!client &&
            !!session &&
            mounted.current,
        );
        // Keep selection, attachments, delivery mode and ownership metadata in their existing owners.
        if (!request.browserCapture) {
          setValue(next);
          return;
        }
        const browser = request.browserCapture;
        if (
          !client ||
          !session ||
          !client.machine.capabilities?.includes("browser.annotation") ||
          !supportsAttachmentOwnership(client) ||
          !browser.isCurrent() ||
          browser.capture.projectId !== session.projectId ||
          browser.capture.sessionId !== scope.sessionId ||
          current.attachments.length >= ATTACHMENT_COUNT ||
          current.attachments.some((file) => file.browserAnnotation?.id === browser.capture.id)
        )
          throw new Error("The browser selection cannot be added to this draft.");
        let staged: StagedAttachment | undefined;
        try {
          staged = stageBrowserCapture(browser.capture, browser.comment, {
            machineId: scope.machineId,
            projectId: session.projectId,
            sessionId: scope.sessionId,
            navigationId: browser.capture.navigationId,
          });
          if (
            !browser.isCurrent() ||
            !mounted.current ||
            useMachines.getState().activeId !== scope.machineId ||
            submission.current ||
            transfer.current
          )
            throw new Error("The browser selection changed before it could be added.");
          setValue({ ...next, attachments: [...current.attachments, staged] });
        } catch (error) {
          if (staged) removeStagedFile(staged);
          throw error;
        }
      }),
    [
      composerTransfer,
      scope,
      unavailable,
      client,
      session,
      setValue,
      valueRef,
      noteContextSupported,
    ],
  );
  const sendDisabledFor = (target: ComposerDelivery) =>
    !client ||
    !session ||
    (!prompt.trim() && !value.attachments.length && !value.noteCard) ||
    !!noteError ||
    unavailable ||
    (target === "queue" && (!queue.supported || (!!queue.error && !client?.machine.capabilities?.includes(OUTBOX_CAPABILITY)))) ||
    (target === "send" && running) ||
    (target === "steer" && !canSteer);
  const sendDisabled = sendDisabledFor(mode);
  const keyboardActive = routeFocused && inputFocused && !palette.visible && !picker && !templatePicker && !draftDetailsOpen;
  const hardwareSend = () => { if (!sendDisabled) void submit().catch(setLocalError); };
  useKeyCommand({ key: "Enter", primary: true, title: copy("Gönder", "Send"), enabled: keyboardActive, textInput: true }, hardwareSend);
  useKeyCommand({ key: "Enter", title: copy("Gönder", "Send"), enabled: keyboardActive && enterSends && !token, textInput: true }, hardwareSend);
  const alternateMode = running ? busyAlternateMode(mode, delivery.available) : null;
  const alternate = alternateMode && !sendDisabledFor(alternateMode) ? alternateMode : null;
  const insertTemplateBody = (body: string) => {
    if (
      !ready ||
      uploading ||
      submission.current ||
      useMachines.getState().activeId !== scope.machineId ||
      templateDestination.current?.machineId !== scope.machineId ||
      templateDestination.current?.sessionId !== scope.sessionId
    )
      throw new Error(
        copy(
          "Bu konuşmaya şu anda ekleme yapılamıyor. Taslağınız değişmedi.",
          "This conversation is not available for insertion. Your draft is unchanged.",
        ),
      );
    const current = valueRef.current ?? emptyComposerDraft();
    const result = insertTemplate(current.text, selection, body);
    if (result.text.length > 256_000) {
      throw new Error(copy("Mesaj çok uzun.", "The message is too long."));
    }
    setValue({ ...current, text: result.text });
    setSelection(result.selection);
    suggestions.reopen();
  };
  const hasContent = !!prompt.trim() || value.attachments.length > 0 || !!value.noteCard;
  const canStop = running && !!session?.runId;
  const stop = () => {
    if (!session || !session.runId || stopping.current) return;
    const intent = sessionIntent(session, {
      type: "cancel",
      sessionId: scope.sessionId,
      runId: session.runId,
    });
    // Pause durable follow-ups before stopping the exact active run.
    // A pause failure must not hide the session's primary Stop action.
    stopping.current = true;
    setLocalError(null);
    void (async () => {
      if (mounted.current) setStopBusy(true);
      try {
        if (queue.supported) await queue.pause().catch(() => {});
        await onCommand(intent);
      } finally {
        stopping.current = false;
        if (mounted.current) setStopBusy(false);
      }
    })().catch((cause: unknown) => {
      // The run may still be going: show why Stop failed instead of dropping it.
      if (mounted.current) setLocalError(cause);
    });
  };
  const contextReading = composerContextReading(session);
  const compact = () => {
    if (!session || running || unavailable || submission.current) return;
    setLocalError(null);
    // Same Host `compact` command as typing /compact; failures stay beside the composer.
    void (async () => {
      await onCommand({
        type: "compact",
        sessionId: session.session.id,
        ...captureSessionAuthority(session),
      });
    })().catch((cause: unknown) => {
      if (mounted.current) setLocalError(cause);
    });
  };
  const hostDraftExists = !!session?.session.blocks.some((block) => block.draft);
  const modeBlockedReasons: Partial<Record<ComposerMode, string>> = {
    ...(value.noteCard || mode === "steer"
      ? {
          plan: value.noteCard
            ? copy("Not bağlamıyla kullanılamaz", "Not available with note context")
            : copy("Yönlendirmede kullanılamaz", "Not available when steering"),
        }
      : {}),
    ...(value.noteCard
      ? { draft: copy("Not bağlamıyla kullanılamaz", "Not available with note context") }
      : running
        ? {
            draft: copy(
              "Agent çalışırken kullanılamaz",
              "Not available while the agent is running",
            ),
          }
        : hostDraftExists
          ? { draft: copy("Zaten kayıtlı bir taslak var", "A draft is already saved") }
          : {}),
  };
  const chooseMode = (next: ComposerMode) => {
    if (unavailable || (activeMode !== next && modeBlockedReasons[next])) return;
    const text = setComposerMode(valueRef.current?.text ?? prompt, next);
    setValue((current) => ({ ...(current ?? emptyComposerDraft()), text }));
    setSelection({ start: text.length, end: text.length });
    setPicker(false);
  };
  const openDraftDetails = () => {
    Keyboard.dismiss();
    setPicker(false);
    setDraftDetailsOpen(true);
  };
  const noteErrorMessage = noteError ? (composerDeliveryError(noteError, copy) ?? noteError.message) : undefined;
  const draftDetails = hasPrefix ? (
    <View style={{ gap: space.xs }}>
      {value.noteCard ? (
        <ComposerNoteCard
          card={value.noteCard}
          error={noteErrorMessage}
          disabled={unavailable}
          onRemove={() => setValue((current) => current ? { ...current, noteCard: undefined } : current)}
        />
      ) : null}
      {activeMode ? (
        <ComposerModeChip mode={activeMode} disabled={unavailable} onRemove={() => chooseMode(activeMode)} />
      ) : null}
      {links.length ? <ComposerLinks links={links} /> : null}
      {value.attachments.length ? (
        <ComposerAttachments
          files={value.attachments}
          scope={`${scope.machineId}:${scope.sessionId}`}
          transfers={transfers}
          disabled={unavailable}
          onRetry={(file) => { void uploads.retry(file); }}
          onRemove={uploads.remove}
        />
      ) : null}
    </View>
  ) : null;
  return (
    <ComposerActionsProvider>
      <View style={{ gap: space.xs }}>
        <SessionAgents session={session} scope={scope} disabled={blocked} onCommand={onCommand}>
          {(controls) => (
            <View
              // A hidden row reports zero. Keep its expanded height for the next layout decision.
              onLayout={shortFrame ? undefined : measureOperations}
              style={{
                display: shortFrame ? "none" : "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: space.sm,
              }}
            >
              {controls}
              <SessionQueue
                scope={scope}
                queue={queue}
                blocked={blocked || unavailable}
                running={running}
                onCommand={onCommand}
              />
            </View>
          )}
        </SessionAgents>
        {token ? (
          <View onLayout={measureSuggestions}>
            <ComposerSuggestions
              keyboardActive={keyboardActive}
              maximumHeight={suggestionLimits.maximum}
              items={suggestions.items}
              loading={suggestions.catalog.isFetching}
              error={suggestions.catalog.error}
              trigger={token.trigger}
              query={token.query}
              selected={suggestions.selected}
              onMove={suggestions.move}
              onPick={suggestions.choose}
              onRetry={() => { void suggestions.catalog.refetch(); }}
              onClose={suggestions.close}
            />
          </View>
        ) : null}
        <ChatComposer
          onToolbarLayout={measureToolbar}
          inlineSubmit={shortFrame}
          inlineLeading={shortFrame && !showInlinePrefix && !showSuggestions && noteErrorMessage ? (
            <ChatCircleAction label={copy("Taslağı incele", "Review draft")} hint={noteErrorMessage} onPress={openDraftDetails}>
              <TriangleAlert size={19} color={colors.warning} />
            </ChatCircleAction>
          ) : undefined}
          value={prompt}
          onValueChange={(text) => {
            if (/^\s*\/btw$/i.test(prompt) && text === `${prompt} ` &&
                selection.start === prompt.length && selection.end === prompt.length && openSideQuestion()) {
              setValue((current) => current ? { ...current, text: "" } : current);
              setSelection({ start: 0, end: 0 });
              suggestions.close();
              return;
            }
            const templates = useTemplates.getState();
            const expanded =
              templates.hydrated && !templates.error
                ? expandTemplateTrigger(prompt, text, selection, templates.rows)
                : null;
            setValue((current) => ({
              ...(current ?? emptyComposerDraft()),
              text: expanded?.text ?? text,
            }));
            if (expanded) setSelection(expanded.selection);
            suggestions.reopen();
          }}
          disabled={!ready}
          top={
            showInlinePrefix ? (
              <ScrollView
                onLayout={measurePrefix}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                style={{ flexGrow: 0, maxHeight: prefixMaximum }}
                contentContainerStyle={{ paddingHorizontal: space.md, paddingTop: space.sm }}
              >
                {draftDetails}
              </ScrollView>
            ) : null
          }
          model={
            session
              ? ({ iconOnly }) => (
                  <ComposerModelChip
                    machineId={scope.machineId}
                    session={session}
                    blocked={blocked}
                    iconOnly={iconOnly}
                    context={contextReading ? {
                      reading: contextReading,
                      compactDisabled: running || unavailable,
                      onCompact: contextReading.empty ? undefined : compact,
                    } : undefined}
                    onCommand={onCommand}
                  />
                )
              : undefined
          }
          status={
            session && contextNeedsAttention(contextReading) ? (
              <ComposerContextRing
                reading={contextReading!}
                onPress={() => {
                  Keyboard.dismiss();
                  openModelSheet(scope.machineId, scope.sessionId);
                }}
              />
            ) : undefined
          }
          leading={
            <ChatCircleAction
              label={
                showSuggestions ? copy("Önerileri kapat", "Dismiss suggestions") : copy("Mesaja ekle", "Add to message")
              }
              disabled={showSuggestions ? false : unavailable}
              busy={showSuggestions ? false : picking}
              onPress={showSuggestions ? suggestions.close : () => {
                Keyboard.dismiss();
                setPicker(true);
              }}
            >
              {showSuggestions ? (
                <X size={19} strokeWidth={2.2} color={colors.text} />
              ) : (
                <Plus size={19} strokeWidth={2.2} color={colors.text} />
              )}
            </ChatCircleAction>
          }
          field={{
            onFocus: () => setInputFocused(true),
            onBlur: () => setInputFocused(false),
            accessibilityLabel: copy("Mesaj", "Message"),
            selection,
            onSelectionChange: (event) => {
              if (ready) setSelection(event.nativeEvent.selection);
            },
            onKeyPress: suggestions.onKeyPress,
            disableFullscreenUI: true,
            submitBehavior: "newline",
            maxLength: 256_000,
            placeholder: copy("Mesaj", "Message"),
            style: { maxHeight: maximumInputHeight },
          }}
          secondarySubmit={<ComposerDictationButton dictation={dictation} />}
          submit={
            <>
              {canStop ? (
                <ChatCircleAction
                  label={copy("Durdur", "Stop")}
                  danger
                  busy={stopBusy}
                  disabled={blocked}
                  onPress={stop}
                >
                  <Square
                    size={13}
                    strokeWidth={0}
                    fill={colors.primaryText}
                    color={colors.primaryText}
                  />
                </ChatCircleAction>
              ) : null}
              {/* One slot: Stop while running with an empty draft; Send otherwise. A draft typed
                  during a run keeps Stop direct beside Send (steer/queue on long-press). */}
              {canStop && !hasContent ? null : (
                <ComposerSendButton
                  mode={mode}
                  alternate={alternate}
                  disabled={sendDisabled}
                  busy={uploading || (!ready && !!session && !error)}
                  onSend={(target) => {
                    void submit(target);
                  }}
                />
              )}
            </>
          }
        />
        <View onLayout={measureFooter} style={{ gap: space.xs }}>
          <ComposerDictationFeedback dictation={dictation} />
          <ComposerNotices
            error={error || localError}
            noteError={!showInlinePrefix && !draftDetailsOpen ? noteError : undefined}
            mode={mode}
            running={running}
            queueSupported={queue.supported}
            desktopOwned={desktopOwned}
            missingRun={!session?.runId}
            cancellable={
              uploading && Object.values(transfers).some((state) => state.status === "uploading")
            }
            onCancelUpload={uploads.cancel}
            draftError={!!error}
            ready={ready}
            retrying={retryingDraft}
            onRetrySend={() => {
              void submit();
            }}
            sending={busy || uploading}
            onRetryDraft={() => {
              if (retryingDraft) return;
              setRetryingDraft(true);
              void (ready ? persist() : load())
                .catch(() => {})
                .finally(() => {
                  if (mounted.current) setRetryingDraft(false);
                });
            }}
          />
        </View>
      </View>
      {sideOpen ? <SideChatSheet visible sessionId={scope.sessionId} onClose={() => setSideOpen(false)} /> : null}
      <ComposerSheets
        scope={scope}
        projectId={session?.projectId}
        pickerOpen={picker}
        onPickerClose={() => setPicker(false)}
        draftDetails={draftDetailsOpen ? draftDetails : undefined}
        draftDetailsOpen={draftDetailsOpen}
        onDraftDetailsOpen={hasPrefix ? openDraftDetails : undefined}
        onDraftDetailsClose={() => setDraftDetailsOpen(false)}
        templateOpen={templatePicker}
        onTemplateOpen={() => {
          templateDestination.current = { ...scope };
          setPicker(false);
          setTemplatePicker(true);
        }}
        onTemplateClose={() => setTemplatePicker(false)}
        onChoose={(kind) => {
          setPicker(false);
          void uploads.choose(kind);
        }}
        onInsertTemplate={insertTemplateBody}
        modes={{ active: activeMode, blockedReasons: modeBlockedReasons, onSelect: chooseMode }}
      />
    </ComposerActionsProvider>
  );
}

function useComposerHeight() {
  const [height, setHeight] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (Number.isFinite(next) && next >= 0)
      setHeight((previous) => (previous === Math.ceil(next) ? previous : Math.ceil(next)));
  }, []);
  return [height, onLayout] as const;
}
