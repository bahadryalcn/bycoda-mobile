import { useMobileTheme } from "@/ui/theme";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Plus from "lucide-react-native/icons/plus";
import X from "lucide-react-native/icons/x";
import Square from "lucide-react-native/icons/square";
import { randomUUID } from "expo-crypto";
import { useHostClient } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { space } from "@/ui/tokens";
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
import { ComposerModeChip, ComposerModeMenu } from "./composer-mode-controls";
import { activeComposerMode, setComposerMode, type ComposerMode } from "./composer-mode";
import { ChatComposer } from "@/ui/chat-composer";
import { ComposerModelChip } from "./composer-model-chip";
import { ComposerActionsProvider } from "@/ui/composer-actions";
import { composerInputLimits, composerSuggestionLimits } from "@/ui/chat-composer-model";
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
import { ComposerContextMeter } from "./composer-context-meter";
import { composerContextReading } from "./composer-context";
import { ComposerAccessMenu } from "./composer-access";
import { composerAccessAvailable } from "./composer-access-model";
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

export function SessionComposer({
  scope,
  session,
  blocked,
  busy,
  onCommand,
}: SessionComposerProps & { onOpenSettings?: () => void }) {
  const { colors } = useMobileTheme();
  useTemplateHydration();
  const copy = useCopy();
  useKeyboardPreferenceHydration();
  const enterSends = useKeyboardPreferences((state) => state.hydrated && !state.error && state.enterSends);
  const routeFocused = useIsFocused();
  const [inputFocused, setInputFocused] = useState(false);
  const palette = useCommandPalette();
  const client = useHostClient();
  const account = useAccount();
  const outboxIntent = useRef<string | null>(null);
  const queue = useSessionQueue(scope);
  const submission = useRef(false);
  const queuedDraft = useRef<QueuedComposerDraft | null>(null);
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const availableHeight = use(SessionKeyboardSpace);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [picker, setPicker] = useState(false);
  const [templatePicker, setTemplatePicker] = useState(false);
  const templateDestination = useRef<{ machineId: string; sessionId: string } | null>(null);
  const [retryingDraft, setRetryingDraft] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [localError, setLocalError] = useState<unknown>(null);
  const mounted = useMounted();
  const [prefixHeight, measurePrefix] = useComposerHeight();
  const [operationsHeight, measureOperations] = useComposerHeight();
  const [footerHeight, measureFooter] = useComposerHeight();
  const [toolbarHeight, measureToolbar] = useComposerHeight();
  const [suggestionsHeight, measureSuggestions] = useComposerHeight();
  const suggestionLimits = composerSuggestionLimits(
    windowHeight,
    availableHeight,
    fontScale,
    prefixHeight + operationsHeight,
    footerHeight,
    toolbarHeight,
  );
  const draftKey = composerDraftKey(scope.machineId, scope.sessionId);
  const draft = useLocalDraft(draftKey, decodeComposerDraft, encodeComposerDraft);
  const { ready, isStored, persist, load, setValue, valueRef, error } = draft;
  const composerTransfer = useComposerTransfer();
  const value = draft.value ?? emptyComposerDraft();
  const prompt = value.text;
  const links = useMemo(() => composerLinks(prompt), [prompt]);
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
  const suggestions = useComposerSuggestions({
    session,
    prompt,
    selection,
    setSelection,
    setValue,
  });
  const { token } = suggestions;
  const suggestionPrefix = token ? suggestionsHeight + (prefixHeight > 0 ? space.xs : 0) : 0;
  const inputLimits = composerInputLimits(
    windowHeight,
    availableHeight,
    fontScale,
    prefixHeight + operationsHeight + suggestionPrefix,
    footerHeight,
    toolbarHeight,
  );
  const maximumInputHeight = inputLimits.maximum;
  const compactSuggestions = !!token && suggestionLimits.compact;
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
        account.status !== "signedIn" || useMachines.getState().activeId !== scope.machineId)
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
    const submitted = valueRef.current;
    if (
      !submitted ||
      (!submitted.text.trim() && !submitted.attachments.length && !submitted.noteCard)
    )
      return;
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
      if (outboxSupported) {
        const references = submitted.attachments.map(({ uri: _uri, claimId: _claimId, ...reference }) => reference);
        const command = sendMode === "queue"
          ? queuedComposerMessage(clientMessageId, { ...intendedSession, authorityGeneration: queuedDraft.current!.authorityGeneration }, submitted.text, references, submitted.noteCard)
          : composerCommand(intendedSession, sendMode, submitted.text, references, submitted.noteCard);
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
  const keyboardActive = routeFocused && inputFocused && !palette.visible && !picker && !templatePicker;
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
    if (!session || !session.runId || stopping) return;
    const intent = sessionIntent(session, {
      type: "cancel",
      sessionId: scope.sessionId,
      runId: session.runId,
    });
    // Pause durable follow-ups before stopping the exact active run.
    // A pause failure must not hide the session's primary Stop action.
    void (async () => {
      setStopping(true);
      try {
        if (queue.supported) await queue.pause().catch(() => {});
        await onCommand(intent);
      } finally {
        if (mounted.current) setStopping(false);
      }
    })().catch(() => {});
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
  const activeMode = activeComposerMode(prompt);
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
  };
  return (
    <ComposerActionsProvider>
      <View style={{ gap: space.xs }}>
        {token ? (
          <View onLayout={measureSuggestions}>
            <ComposerSuggestions
              keyboardActive={keyboardActive}
              maximumHeight={suggestionLimits.maximum}
              compact={suggestionLimits.compact}
              items={suggestions.items}
              loading={suggestions.catalog.isFetching}
              error={suggestions.catalog.error}
              trigger={token.trigger}
              selected={suggestions.selected}
              onPick={suggestions.choose}
              onRetry={() => {
                void suggestions.catalog.refetch();
              }}
              onClose={suggestions.close}
            />
          </View>
        ) : null}
        <SessionAgents session={session} scope={scope} disabled={blocked} onCommand={onCommand}>
          {(controls) => (
            <View
              onLayout={measureOperations}
              style={{
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
        <ChatComposer
          onToolbarLayout={measureToolbar}
          value={prompt}
          onValueChange={(text) => {
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
            value.noteCard || value.attachments.length || links.length || activeMode ? (
              <View
                onLayout={measurePrefix}
                style={{ gap: space.xs, paddingHorizontal: space.md, paddingTop: space.sm }}
              >
                {value.noteCard ? (
                  <ComposerNoteCard
                    card={value.noteCard}
                    error={
                      noteError
                        ? (composerDeliveryError(noteError, copy) ?? noteError.message)
                        : undefined
                    }
                    disabled={unavailable}
                    onRemove={() =>
                      setValue((current) =>
                        current ? { ...current, noteCard: undefined } : current,
                      )
                    }
                  />
                ) : null}
                {activeMode ? (
                  <View style={{ flexDirection: "row" }}>
                    <ComposerModeChip
                      mode={activeMode}
                      disabled={unavailable}
                      onRemove={() => chooseMode(activeMode)}
                    />
                  </View>
                ) : null}
                {links.length ? <ComposerLinks links={links} /> : null}
                {value.attachments.length ? (
                  <ComposerAttachments
                    files={value.attachments}
                    transfers={transfers}
                    disabled={unavailable}
                    onRetry={(file) => {
                      void uploads.retry(file);
                    }}
                    onRemove={uploads.remove}
                  />
                ) : null}
              </View>
            ) : null
          }
          mode={
            <>
              <ComposerModeMenu
                active={activeMode}
                blockedReasons={modeBlockedReasons}
                onSelect={chooseMode}
              />
              {composerAccessAvailable(session) ? (
                <ComposerAccessMenu
                  session={session}
                  disabled={blocked || unavailable}
                  running={running}
                  onCommand={onCommand}
                  onError={setLocalError}
                />
              ) : null}
            </>
          }
          model={
            session ? (
              <ComposerModelChip session={session} blocked={blocked} onCommand={onCommand} />
            ) : undefined
          }
          leading={
            <ChatCircleAction
              label={
                compactSuggestions ? copy("Kapat", "Close") : copy("Mesaja ekle", "Add to message")
              }
              disabled={compactSuggestions ? false : unavailable}
              busy={compactSuggestions ? false : picking}
              onPress={compactSuggestions ? suggestions.close : () => setPicker(true)}
            >
              {compactSuggestions ? (
                <X size={19} strokeWidth={2.4} color={colors.text} />
              ) : (
                <Plus size={19} strokeWidth={2.4} color={colors.text} />
              )}
            </ChatCircleAction>
          }
          field={{
            onFocus: () => setInputFocused(true),
            onBlur: () => setInputFocused(false),
            accessibilityLabel: copy("Mesaj", "Message"),
            selection,
            onSelectionChange: (event) => setSelection(event.nativeEvent.selection),
            onKeyPress: suggestions.onKeyPress,
            disableFullscreenUI: true,
            submitBehavior: "newline",
            maxLength: 256_000,
            placeholder: copy("Mesaj yaz…", "Write a message…"),
            style: { maxHeight: maximumInputHeight },
          }}
          submit={
            <>
              {contextReading ? (
                <ComposerContextMeter
                  reading={contextReading}
                  compactDisabled={running || unavailable}
                  onCompact={contextReading.empty ? undefined : compact}
                />
              ) : null}
              {canStop ? (
                <ChatCircleAction
                  label={copy("Durdur", "Stop")}
                  danger
                  busy={stopping}
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
              <ComposerDictationButton dictation={dictation} />
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
      <ComposerSheets
        scope={scope}
        projectId={session?.projectId}
        pickerOpen={picker}
        onPickerClose={() => setPicker(false)}
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
