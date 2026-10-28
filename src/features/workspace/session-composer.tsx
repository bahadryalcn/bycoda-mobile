import { useMobileTheme } from "@/ui/theme";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Plus from "lucide-react-native/icons/plus";
import Check from "lucide-react-native/icons/check";
import { randomUUID } from "expo-crypto";
import ImageIcon from "lucide-react-native/icons/image";
import File from "lucide-react-native/icons/file";
import { useHostClient } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { Body, Button, Row, Stack, NavigationGroup, NavigationRow, Sheet } from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { colors, metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { registerWorkspaceDraft } from "./draft-guard";
import { ErrorText } from "./shared";
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
import { composerTokenAt, replaceComposerToken, moveSuggestionSelection } from "./composer-tokens";
import { useComposerCatalog, type ComposerSuggestion } from "./use-composer-catalog";
import { ComposerSuggestions } from "./composer-suggestions";
import { ComposerAttachments } from "./composer-attachments";
import { pickAttachments, removeStagedFile, stageBrowserCapture } from "./attachment-files";
import { ATTACHMENT_COUNT, type StagedAttachment, type TransferState } from "./attachment-model";
import { uploadAttachment } from "./attachment-transfer";
import {
  attachmentReleases,
  composerDraftKey,
  supportsAttachmentOwnership,
} from "./attachment-ownership";
import { ChatCircleAction, ChatToolbarAction } from "@/ui/chat-controls";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import { ChatComposer } from "@/ui/chat-composer";
import { haptic } from "@/ui/motion";
import {
  composerCommand,
  desktopOwnsTurn,
  queuedComposerMessage,
  validateNoteDelivery,
  type ComposerDelivery,
} from "./composer-delivery";
import { useSessionQueue } from "./use-session-queue";
import { deliveryAfterRun } from "./queue-delivery";
import { SessionQueue } from "./session-queue";
import { composerDeliveryError } from "./composer-delivery-copy";
import { TemplateLibrary } from "@/features/management/templates/template-library";
import {
  expandTemplateTrigger,
  insertTemplate,
} from "@/features/management/templates/template-model";
import { useTemplateHydration, useTemplates } from "@/features/management/templates/template-store";
import { useComposerTransfer } from "./composer-transfer";
import { appendComposerTransfer } from "./composer-transfer-model";
import { captureSessionAuthority } from "@/domain/session-authority";

export function SessionComposer({
  scope,
  session,
  blocked,
  busy,
  onCommand,
}: SessionComposerProps) {
  useMobileTheme();
  useTemplateHydration();
  const copy = useCopy();
  const client = useHostClient();
  const queue = useSessionQueue(scope);
  const [delivery, setDelivery] = useState<ComposerDelivery>("send");
  const initializedDelivery = useRef(false);
  const deliveryChosen = useRef(false);
  const submission = useRef(false);
  const queuedDraft = useRef<QueuedComposerDraft | null>(null);
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const availableHeight = use(SessionKeyboardSpace);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [selected, setSelected] = useState(-1);
  const [picker, setPicker] = useState(false);
  const [templatePicker, setTemplatePicker] = useState(false);
  const templateDestination = useRef<{ machineId: string; sessionId: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [modePicker, setModePicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [retryingDraft, setRetryingDraft] = useState(false);
  const [localError, setLocalError] = useState<unknown>(null);
  const [transfers, setTransfers] = useState<Record<string, TransferState>>({});
  const transfer = useRef<AbortController | null>(null);
  const claimedFiles = useRef(new Map<string, StagedAttachment>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      transfer.current?.abort();
    };
  }, []);
  const minimumInputHeight = Math.max(
    metrics.touchTarget,
    Math.ceil(22 * fontScale + space.sm * 2),
  );
  const maximumInputHeight = Math.max(
    minimumInputHeight,
    Math.min(
      160,
      Math.floor(windowHeight / 4),
      Math.floor((availableHeight ?? windowHeight) * 0.45),
    ),
  );
  const draftKey = composerDraftKey(scope.machineId, scope.sessionId);
  const draft = useLocalDraft(draftKey, decodeComposerDraft, encodeComposerDraft);
  const { ready, isStored, persist, load, setValue, valueRef, error } = draft;
  const composerTransfer = useComposerTransfer();
  const value = draft.value ?? emptyComposerDraft();
  const prompt = value.text;
  const running = session?.status === "running";
  const wasRunning = useRef(running);
  useEffect(() => {
    const previous = wasRunning.current;
    setDelivery((current) => deliveryAfterRun(current, previous, running, deliveryChosen.current));
    wasRunning.current = running;
  }, [running]);
  const supportsSteer = !!client?.machine.capabilities?.includes("sessions.steer");
  const desktopOwned = !!session && desktopOwnsTurn(session);
  const canSteer = supportsSteer && running && !!session?.runId && !desktopOwned;
  const mode = delivery;
  const noteContextSupported =
    client?.machine.id === scope.machineId &&
    !!client.machine.capabilities?.includes("sessions.noteContext.v1");
  let noteError: Error | undefined;
  try {
    validateNoteDelivery(value.noteCard, mode, prompt, noteContextSupported);
  } catch (cause) {
    noteError = cause as Error;
  }
  useEffect(() => {
    if (!session || initializedDelivery.current) return;
    initializedDelivery.current = true;
    setDelivery(session.status === "running" && queue.supported ? "queue" : "send");
  }, [session, queue.supported]);
  const deliveryOptions = [
    { value: "send" as const, label: copy("Gönder", "Send") },
    ...(queue.supported ? [{ value: "queue" as const, label: copy("Sıraya al", "Queue") }] : []),
    ...(supportsSteer ? [{ value: "steer" as const, label: copy("Yönlendir", "Steer") }] : []),
  ];
  const modeLabel = deliveryOptions.find((option) => option.value === mode)?.label ?? "";
  // Delivery choice matters only while a run is active (or when a non-send mode is still set).
  const showModeChip = deliveryOptions.length > 1 && (running || mode !== "send");
  useEffect(
    () => (ready && !isStored ? registerWorkspaceDraft(draftKey, () => persist()) : undefined),
    [ready, isStored, draftKey, persist],
  );
  const detected = composerTokenAt(prompt, selection);
  const tokenId = detected ? `${detected.start}:${detected.trigger}:${detected.query}` : "";
  const token = tokenId && tokenId !== dismissed ? detected : null;
  const catalog = useComposerCatalog(session, token);
  const items = useMemo(() => {
    const needle = token?.query.toLocaleLowerCase() ?? "";
    return (catalog.data ?? [])
      .filter(
        (item) => !needle || `${item.name} ${item.detail}`.toLocaleLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          Number(b.name.toLocaleLowerCase().startsWith(needle)) -
          Number(a.name.toLocaleLowerCase().startsWith(needle)),
      )
      .slice(0, 30);
  }, [catalog.data, token?.query]);
  useEffect(() => setSelected(-1), [tokenId]);
  const choose = (item: ComposerSuggestion) => {
    if (!token) return;
    const replacement = replaceComposerToken(prompt, token, item.label);
    setValue((current) => ({
      ...(current ?? emptyComposerDraft()),
      text: replacement.text,
      selectedMentionRefs: item.path
        ? [
            ...(current?.selectedMentionRefs ?? []).filter((ref) => ref.label !== item.label),
            { label: item.label, path: item.path },
          ]
        : (current?.selectedMentionRefs ?? []),
    }));
    setSelection({ start: replacement.cursor, end: replacement.cursor });
    setDismissed(null);
  };
  const chooseFiles = async (kind: "photo" | "document") => {
    setPicker(false);
    setPicking(true);
    setLocalError(null);
    try {
      const files = await pickAttachments(kind, `${scope.machineId}:${scope.sessionId}`);
      if (!mounted.current) {
        files.forEach(removeStagedFile);
        return;
      }
      const current = valueRef.current ?? emptyComposerDraft();
      if (current.attachments.length + files.length > ATTACHMENT_COUNT) {
        files.forEach(removeStagedFile);
        throw new Error(
          copy("En fazla 20 dosya ekleyebilirsin.", "You can attach up to 20 files."),
        );
      }
      setValue({ ...current, attachments: [...current.attachments, ...files] });
    } catch (cause) {
      if (mounted.current) setLocalError(cause);
    } finally {
      if (mounted.current) setPicking(false);
    }
  };
  const upload = async (file: StagedAttachment, controller: AbortController) => {
    if (!client) throw new Error(copy("Bilgisayara bağlan.", "Connect to your computer."));
    const update = (state: TransferState) => {
      if (mounted.current) setTransfers((current) => ({ ...current, [file.id]: state }));
    };
    update({ status: "uploading", progress: 0 });
    try {
      let prepared = file;
      if (supportsAttachmentOwnership(client)) {
        await attachmentReleases.flush(client).catch(() => {});
        const claimId = await attachmentReleases.prepare(client, scope.sessionId, file);
        prepared = { ...file, claimId };
        if (
          !mounted.current ||
          !valueRef.current?.attachments.some((entry) => entry.id === file.id)
        )
          throw new Error("Attachment upload cancelled.");
        setValue((current) =>
          current
            ? {
                ...current,
                attachments: current.attachments.map((entry) =>
                  entry.id === file.id ? { ...entry, claimId } : entry,
                ),
              }
            : current,
        );
      }
      // Claim only after the private file reference and generation are durable.
      await persist();
      claimedFiles.current.set(file.id, prepared);
      const ref = await uploadAttachment(
        client,
        prepared,
        scope.sessionId,
        controller.signal,
        (progress) => update({ status: "uploading", progress }),
      );
      update({ status: "ready", progress: 1 });
      return ref;
    } catch (cause) {
      update({ status: "error", progress: 0, error: cause });
      throw cause;
    }
  };
  const retry = async (file: StagedAttachment) => {
    if (transfer.current || submission.current) return;
    const controller = new AbortController();
    transfer.current = controller;
    setUploading(true);
    setLocalError(null);
    try {
      await upload(file, controller);
    } catch {
      /* The attachment card owns upload failure and retry. */
    } finally {
      if (mounted.current) setUploading(false);
      transfer.current = null;
    }
  };
  const submit = async () => {
    if (!ready || blocked || busy || uploading || submission.current || !client || !session) return;
    if (mode === "queue" && (!queue.supported || !!queue.error || queue.changing)) return;
    const submitted = valueRef.current;
    if (
      !submitted ||
      (!submitted.text.trim() && !submitted.attachments.length && !submitted.noteCard)
    )
      return;
    try {
      if (
        client.machine.id !== scope.machineId ||
        useMachines.getState().activeId !== scope.machineId
      )
        return;
      validateNoteDelivery(submitted.noteCard, mode, submitted.text, noteContextSupported);
      captureSessionAuthority(session);
    } catch (cause) {
      setLocalError(cause);
      return;
    }
    if (
      /^\s*\/compact\s*$/.test(submitted.text) &&
      (mode === "steer" || submitted.attachments.length)
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
    if (mode === "queue")
      queuedDraft.current = queuedComposerDraft(
        queuedDraft.current,
        submitted,
        randomUUID,
        intendedSession,
      );
    submission.current = true;
    transfer.current = controller;
    setUploading(true);
    setLocalError(null);
    try {
      if (mode === "queue") {
        setValue((current) =>
          current ? retainQueuedComposerIntent(current, queuedDraft.current!) : current,
        );
        await persist();
        if (controller.signal.aborted || !mounted.current) return;
      }
      const attachments = [];
      for (const file of submitted.attachments) attachments.push(await upload(file, controller));
      if (controller.signal.aborted || !mounted.current) return;
      // Stage before delivery: a later storage failure cannot mask an accepted send.
      // Until draft removal is durable, the saved draft blocks this tombstone.
      await attachmentReleases.stage(
        client,
        scope.sessionId,
        submitted.attachments.map((file) => claimedFiles.current.get(file.id) ?? file),
      );
      if (mode === "queue") {
        await queue.enqueue(
          queuedComposerMessage(
            queuedDraft.current!.id,
            { ...intendedSession, authorityGeneration: queuedDraft.current!.authorityGeneration },
            submitted.text,
            attachments,
            submitted.noteCard,
          ),
        );
      } else
        await onCommand(
          composerCommand(intendedSession, mode, submitted.text, attachments, submitted.noteCard),
        );
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
      submitted.attachments.forEach((file) => {
        removeStagedFile(file);
        claimedFiles.current.delete(file.id);
      });
      // Remote release failure must not turn an accepted send into a send retry.
      void attachmentReleases.flush(client).catch(() => {});
      haptic.success();
    } catch (cause) {
      if (mounted.current) setLocalError(cause);
    } finally {
      submission.current = false;
      if (mounted.current) setUploading(false);
      transfer.current = null;
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
  const sendDisabled =
    !client ||
    !session ||
    (!prompt.trim() && !value.attachments.length && !value.noteCard) ||
    !!noteError ||
    unavailable ||
    (mode === "queue" && (!queue.supported || !!queue.error)) ||
    (mode === "send" && running) ||
    (mode === "steer" && !canSteer);
  return (
    <View
      style={{
        paddingVertical: space.sm,
        gap: space.xs,
        backgroundColor: colors.background,
      }}
    >
      {token ? (
        <ComposerSuggestions
          items={items}
          loading={catalog.isFetching}
          error={catalog.error}
          trigger={token.trigger}
          selected={selected}
          onPick={choose}
          onRetry={() => {
            void catalog.refetch();
          }}
          onClose={() => setDismissed(tokenId)}
        />
      ) : null}
      {value.noteCard ? (
        <Stack>
          <Row>
            <Stack style={{ flex: 1, minWidth: 0 }}>
              <Body>{value.noteCard.title || copy("Başlıksız", "Untitled")}</Body>
              <Body muted>
                {copy("Not bağlamı · incelenen kopya", "Note context · reviewed copy")}
              </Body>
            </Stack>
            <Button
              tone="quiet"
              label={copy("Not bağlamını kaldır", "Remove note context")}
              disabled={unavailable}
              onPress={() =>
                setValue((current) => (current ? { ...current, noteCard: undefined } : current))
              }
            />
          </Row>
          {noteError ? (
            <Body muted>{composerDeliveryError(noteError, copy) ?? noteError.message}</Body>
          ) : null}
        </Stack>
      ) : null}
      {value.attachments.length ? (
        <ComposerAttachments
          files={value.attachments}
          transfers={transfers}
          disabled={unavailable}
          onRetry={(file) => {
            void retry(file);
          }}
          onRemove={(file) => {
            void (async () => {
              const machine =
                client?.machine ??
                useMachines.getState().machines.find((entry) => entry.id === scope.machineId);
              const latest =
                valueRef.current?.attachments.find((entry) => entry.id === file.id) ??
                claimedFiles.current.get(file.id) ??
                file;
              if (machine) await attachmentReleases.stage({ machine }, scope.sessionId, [latest]);
              setValue((current) => ({
                ...(current ?? emptyComposerDraft()),
                attachments: (current?.attachments ?? []).filter((entry) => entry.id !== file.id),
              }));
              await persist();
              removeStagedFile(file);
              claimedFiles.current.delete(file.id);
              if (client) void attachmentReleases.flush(client).catch(() => {});
            })().catch((cause) => {
              if (mounted.current) setLocalError(cause);
            });
          }}
        />
      ) : null}
      <SessionQueue
        scope={scope}
        queue={queue}
        blocked={blocked || unavailable}
        running={running}
        onCommand={onCommand}
      />
      <ChatComposer
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
          setDismissed(null);
        }}
        disabled={!ready}
        mode={
          showModeChip ? (
            <ChatToolbarAction
              label={modeLabel}
              disabled={unavailable}
              onPress={() => setModePicker(true)}
            >
              <ChevronDown size={12} color={colors.muted} />
            </ChatToolbarAction>
          ) : undefined
        }
        leading={
          <ChatCircleAction
            label={copy("Mesaja ekle", "Add to message")}
            disabled={unavailable}
            busy={picking}
            onPress={() => setPicker(true)}
          >
            <Plus size={19} strokeWidth={2.4} color={colors.text} />
          </ChatCircleAction>
        }
        field={{
          accessibilityLabel: copy("Mesaj", "Message"),
          selection,
          onSelectionChange: (event) => setSelection(event.nativeEvent.selection),
          onKeyPress: (event) => {
            if (!token) return;
            if (event.nativeEvent.key === "Escape") {
              event.preventDefault();
              setDismissed(tokenId);
            }
            if (event.nativeEvent.key === "ArrowDown" && items.length) {
              event.preventDefault();
              setSelected((index) => moveSuggestionSelection(index, items.length, 1));
            }
            if (event.nativeEvent.key === "ArrowUp" && items.length) {
              event.preventDefault();
              setSelected((index) => moveSuggestionSelection(index, items.length, -1));
            }
            if (
              (event.nativeEvent.key === "Tab" ||
                (event.nativeEvent.key === "Enter" && selected >= 0)) &&
              items[Math.max(0, selected)]
            ) {
              event.preventDefault();
              choose(items[Math.max(0, selected)]!);
            }
          },
          disableFullscreenUI: true,
          submitBehavior: "newline",
          maxLength: 256_000,
          placeholder: copy("Mesaj yaz…", "Write a message…"),
          style: {
            minWidth: 0,
            minHeight: minimumInputHeight,
            maxHeight: maximumInputHeight,
            borderWidth: 0,
            backgroundColor: "transparent",
            lineHeight: 22,
            includeFontPadding: false,
            paddingVertical: space.sm,
            paddingHorizontal: space.sm,
          },
        }}
        submit={
          <ChatCircleAction
            label={
              mode === "queue"
                ? copy("Sıraya al", "Queue")
                : mode === "steer"
                  ? copy("Yönlendir", "Steer")
                  : copy("Gönder", "Send")
            }
            active={!sendDisabled}
            disabled={sendDisabled}
            busy={uploading || (!ready && !!session && !error)}
            onPress={() => {
              void submit();
            }}
          >
            <ArrowUp
              size={18}
              strokeWidth={2.6}
              color={sendDisabled ? colors.muted : colors.primaryText}
            />
          </ChatCircleAction>
        }
      />
      {uploading && Object.values(transfers).some((state) => state.status === "uploading") ? (
        <Button
          tone="quiet"
          density="compact"
          label={copy("Yüklemeyi iptal et", "Cancel upload")}
          onPress={() => transfer.current?.abort()}
        />
      ) : null}
      <ErrorText
        error={error || localError}
        message={composerDeliveryError(error || localError, copy)}
      />
      {mode === "send" && running ? (
        <Body muted style={uiStyles.caption}>
          {queue.supported && supportsSteer
            ? copy(
                "Çalışıyor · Sıraya al veya Yönlendir’i seç.",
                "Running · choose Queue or Steer.",
              )
            : queue.supported
              ? copy("Çalışıyor · Sıraya al’ı seç.", "Running · choose Queue.")
              : supportsSteer
                ? copy("Çalışıyor · Yönlendir’i seç.", "Running · choose Steer.")
                : copy("Bu turun bitmesini bekle.", "Wait for this turn to finish.")}
        </Body>
      ) : null}
      {mode === "steer" && running && desktopOwned ? (
        <Body muted style={uiStyles.caption}>
          {copy(
            "Bu tur masaüstü uygulamasında çalışıyor. Oradan yönlendir veya mesajı sıraya al.",
            "This turn is running in the desktop app. Steer it there or queue your message.",
          )}
        </Body>
      ) : mode === "steer" && running && !session?.runId ? (
        <Body muted style={uiStyles.caption}>
          {composerDeliveryError(new Error("Refresh the running turn before steering it."), copy)}
        </Body>
      ) : null}
      {error ? (
        <Button
          busy={retryingDraft}
          label={
            ready
              ? copy("Taslağı kaydetmeyi yeniden dene", "Retry saving draft")
              : copy("Taslağı yeniden yükle", "Retry loading draft")
          }
          onPress={() => {
            if (retryingDraft) return;
            setRetryingDraft(true);
            void (ready ? persist() : load())
              .catch(() => {})
              .finally(() => {
                if (mounted.current) setRetryingDraft(false);
              });
          }}
        />
      ) : null}
      {(mode === "steer" && !running) || (mode === "queue" && !queue.supported) ? (
        <Body muted style={uiStyles.caption}>
          {mode === "steer"
            ? copy(
                "Yönlendirmek için çalışan bir tur gerekiyor.",
                "Steering requires a running turn.",
              )
            : copy(
                "Bu bilgisayarda sıra desteklenmiyor. Çalışmanın bitmesini bekle.",
                "This computer does not support queuing. Wait for the turn to finish.",
              )}
        </Body>
      ) : null}
      <Sheet
        visible={modePicker}
        title={copy("Gönderme biçimi", "Delivery mode")}
        size="compact"
        onClose={() => setModePicker(false)}
      >
        <NavigationGroup>
          {deliveryOptions.map((option) => (
            <NavigationRow
              key={option.value}
              label={option.label}
              detail={
                option.value === "steer"
                  ? copy(
                      "Aktif çalışmayı bu mesajla yönlendirir.",
                      "Redirects the active turn with this message.",
                    )
                  : option.value === "queue"
                    ? copy(
                        "Tur bitince gönderilir. Duraklatılmış bir sıra için Sırayı başlat’ı seç.",
                        "Sends after this turn. Choose Start queue if the queue is paused.",
                      )
                    : undefined
              }
              trailing={
                option.value === mode ? (
                  <Check size={18} strokeWidth={2.4} color={colors.accent} />
                ) : undefined
              }
              onPress={() => {
                deliveryChosen.current = true;
                setDelivery(option.value);
                setModePicker(false);
              }}
            />
          ))}
        </NavigationGroup>
      </Sheet>
      <Sheet
        visible={templatePicker}
        title={copy("Telefon şablonları", "Phone templates")}
        size="full"
        scroll={false}
        onClose={() => setTemplatePicker(false)}
      >
        {templatePicker ? (
          <TemplateLibrary
            scope={scope}
            projectId={session?.projectId}
            onClose={() => setTemplatePicker(false)}
            onInsert={(body) => {
              if (
                !ready ||
                uploading ||
                submission.current ||
                useMachines.getState().activeId !== scope.machineId ||
                templateDestination.current?.machineId !== scope.machineId ||
                templateDestination.current?.sessionId !== scope.sessionId
              )
                return;
              const current = valueRef.current ?? emptyComposerDraft();
              const result = insertTemplate(current.text, selection, body);
              if (result.text.length > 256_000) {
                setLocalError(new Error(copy("Mesaj çok uzun.", "The message is too long.")));
                return;
              }
              setValue({ ...current, text: result.text });
              setSelection(result.selection);
              setDismissed(null);
            }}
          />
        ) : null}
      </Sheet>
      <Sheet
        visible={picker}
        title={copy("Mesaja ekle", "Add to message")}
        size="compact"
        onClose={() => setPicker(false)}
      >
        <NavigationGroup>
          <NavigationRow
            label={copy("Telefon şablonları", "Phone templates")}
            onPress={() => {
              templateDestination.current = { ...scope };
              setPicker(false);
              setTemplatePicker(true);
            }}
          />
          <NavigationRow
            label={copy("Fotoğraflar", "Photos")}
            icon={<ImageIcon size={22} color={colors.text} />}
            onPress={() => {
              void chooseFiles("photo");
            }}
          />
          <NavigationRow
            label={copy("Dosyalar", "Files")}
            icon={<File size={22} color={colors.text} />}
            onPress={() => {
              void chooseFiles("document");
            }}
          />
        </NavigationGroup>
      </Sheet>
    </View>
  );
}
