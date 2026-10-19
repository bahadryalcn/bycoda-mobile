import { useMobileTheme } from "@/ui/theme";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
} from "react-native";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Plus from "lucide-react-native/icons/plus";
import Check from "lucide-react-native/icons/check";
import { randomUUID } from "expo-crypto";
import ImageIcon from "lucide-react-native/icons/image";
import File from "lucide-react-native/icons/file";
import { useHostClient } from "@/state/queries";
import { useMachines } from "@/state/machines";
import {
  Body,
  Button,
  Input,
  Loading,
  NavigationGroup,
  NavigationRow,
  Sheet,
} from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { colors, metrics, radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { registerWorkspaceDraft } from "./draft-guard";
import { ErrorText } from "./shared";
import { useLocalDraft } from "./use-local-draft";
import type { SessionComposerProps } from "./session-types";
import { SessionKeyboardSpace } from "./session-keyboard-frame";
import { decodeComposerDraft, emptyComposerDraft, encodeComposerDraft, sameComposerContent, queuedComposerDraft, type QueuedComposerDraft } from "./composer-draft";
import { composerTokenAt, replaceComposerToken } from "./composer-tokens";
import { useComposerCatalog, type ComposerSuggestion } from "./use-composer-catalog";
import { ComposerSuggestions } from "./composer-suggestions";
import { ComposerAttachments } from "./composer-attachments";
import { pickAttachments, removeStagedFile } from "./attachment-files";
import { ATTACHMENT_COUNT, type StagedAttachment, type TransferState } from "./attachment-model";
import { uploadAttachment } from "./attachment-transfer";
import { attachmentReleases, composerDraftKey, supportsAttachmentOwnership } from "./attachment-ownership";
import { ChatCircleAction } from "@/ui/chat-controls";
import { ChatComposerSurface } from "@/ui/chat";
import { haptic, resize } from "@/ui/motion";
import { composerCommand, queuedComposerMessage, type ComposerDelivery } from "./composer-delivery";
import { useSessionQueue } from "./use-session-queue";
import { SessionQueue } from "./session-queue";
import { composerDeliveryError } from "./composer-delivery-copy";

export function SessionComposer({
  scope,
  session,
  blocked,
  busy,
  onCommand,
}: SessionComposerProps) {
  useMobileTheme();
  const copy = useCopy();
  const client = useHostClient();
  const queue = useSessionQueue(scope);
  const [delivery, setDelivery] = useState<ComposerDelivery>("send");
  const initializedDelivery = useRef(false);
  const submission = useRef(false);
  const queuedDraft = useRef<QueuedComposerDraft | null>(null);
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const availableHeight = use(SessionKeyboardSpace);
  const [contentHeight, setContentHeight] = useState(metrics.inputHeight);
  const [inputFocused, setInputFocused] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [selected, setSelected] = useState(-1);
  const [picker, setPicker] = useState(false);
  const [picking, setPicking] = useState(false);
  const [modePicker, setModePicker] = useState(false);
  const [uploading, setUploading] = useState(false);
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
  const minimumInputHeight = Math.max(40, Math.ceil(22 * fontScale + space.sm * 2));
  const maximumInputHeight = Math.max(
    minimumInputHeight,
    Math.min(
      160,
      Math.floor(windowHeight / 4),
      Math.floor((availableHeight ?? windowHeight) * 0.45),
    ),
  );
  const inputHeight = Math.max(minimumInputHeight, Math.min(maximumInputHeight, contentHeight));
  const onContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const next = Math.ceil(event.nativeEvent.contentSize.height);
      if (Number.isFinite(next) && next > 0)
        setContentHeight((previous) => (previous === next ? previous : next));
    },
    [],
  );
  const draftKey = composerDraftKey(scope.machineId, scope.sessionId);
  const draft = useLocalDraft(draftKey, decodeComposerDraft, encodeComposerDraft);
  const { ready, isStored, persist, load, setValue, valueRef, error } = draft;
  const value = draft.value ?? emptyComposerDraft();
  const prompt = value.text;
  const running = session?.status === "running";
  const supportsSteer = !!client?.machine.capabilities?.includes("sessions.steer");
  const canSteer = supportsSteer && running && !!session?.runId;
  const mode = delivery;
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
        if (!mounted.current || !valueRef.current?.attachments.some((entry) => entry.id === file.id))
          throw new Error("Attachment upload cancelled.");
        setValue((current) => current ? { ...current, attachments: current.attachments.map((entry) => entry.id === file.id ? { ...entry, claimId } : entry) } : current);
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
    if (!submitted || (!submitted.text.trim() && !submitted.attachments.length)) return;
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
    submission.current = true;
    transfer.current = controller;
    setUploading(true);
    setLocalError(null);
    try {
      const attachments = [];
      for (const file of submitted.attachments) attachments.push(await upload(file, controller));
      if (controller.signal.aborted || !mounted.current) return;
      // Stage before delivery: a later storage failure cannot mask an accepted send.
      // Until draft removal is durable, the saved draft blocks this tombstone.
      await attachmentReleases.stage(client, scope.sessionId, submitted.attachments.map((file) => claimedFiles.current.get(file.id) ?? file));
      if (mode === "queue") {
        queuedDraft.current = queuedComposerDraft(queuedDraft.current, submitted, randomUUID);
        await queue.enqueue(
          queuedComposerMessage(queuedDraft.current.id, session, submitted.text, attachments),
        );
      } else await onCommand(composerCommand(session, mode, submitted.text, attachments));
      if (!mounted.current) return;
      if (sameComposerContent(valueRef.current, submitted)) {
        setValue(emptyComposerDraft());
        setSelection({ start: 0, end: 0 });
      } else
        setValue((current) =>
          current
            ? {
                ...current,
                attachments: current.attachments.filter(
                  (file) => !submitted.attachments.some((sent) => sent.id === file.id),
                ),
              }
            : current,
        );
      await persist();
      submitted.attachments.forEach((file) => { removeStagedFile(file); claimedFiles.current.delete(file.id); });
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
  const sendDisabled =
    !client ||
    !session ||
    (!prompt.trim() && !value.attachments.length) ||
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
              const machine = client?.machine ?? useMachines.getState().machines.find((entry) => entry.id === scope.machineId);
              const latest = valueRef.current?.attachments.find((entry) => entry.id === file.id) ?? claimedFiles.current.get(file.id) ?? file;
              if (machine) await attachmentReleases.stage({ machine }, scope.sessionId, [latest]);
              setValue((current) => ({
                ...(current ?? emptyComposerDraft()),
                attachments: (current?.attachments ?? []).filter((entry) => entry.id !== file.id),
              }));
              await persist();
              removeStagedFile(file);
              claimedFiles.current.delete(file.id);
              if (client) void attachmentReleases.flush(client).catch(() => {});
            })().catch((cause) => { if (mounted.current) setLocalError(cause); });
          }}
        />
      ) : null}
      <SessionQueue
        scope={scope}
        queue={queue}
        blocked={blocked || unavailable}
        onCommand={onCommand}
      />
      {showModeChip ? (
        <View style={{ flexDirection: "row" }}>
          <Button
            label={modeLabel}
            density="compact"
            tone="secondary"
            disabled={unavailable}
            onPress={() => setModePicker(true)}
          />
        </View>
      ) : null}
      <ChatComposerSurface
        layout={resize}
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: space.xs,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: inputFocused ? colors.accent : colors.separator,
          borderRadius: radii.preview,
          padding: space.xxs,
        }}
      >
        <ChatCircleAction
          label={copy("Dosya ekle", "Attach file")}
          disabled={unavailable}
          busy={picking}
          onPress={() => setPicker(true)}
        >
          <Plus size={19} strokeWidth={2.4} color={colors.text} />
        </ChatCircleAction>
        <Input
          label={copy("Mesaj", "Message")}
          value={prompt}
          onChangeText={(text) => {
            setValue((current) => ({ ...(current ?? emptyComposerDraft()), text }));
            setDismissed(null);
          }}
          selection={selection}
          onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
          onKeyPress={(event) => {
            if (!token) return;
            if (event.nativeEvent.key === "Escape") {
              event.preventDefault();
              setDismissed(tokenId);
            }
            if (event.nativeEvent.key === "ArrowDown" && items.length) {
              event.preventDefault();
              setSelected((index) => (index + 1) % items.length);
            }
            if (event.nativeEvent.key === "ArrowUp" && items.length) {
              event.preventDefault();
              setSelected((index) => (index + items.length - 1) % items.length);
            }
            if (
              (event.nativeEvent.key === "Tab" ||
                (event.nativeEvent.key === "Enter" && selected >= 0)) &&
              items[Math.max(0, selected)]
            ) {
              event.preventDefault();
              choose(items[Math.max(0, selected)]!);
            }
          }}
          multiline
          disableFullscreenUI
          submitBehavior="newline"
          onContentSizeChange={onContentSizeChange}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          scrollEnabled={contentHeight > maximumInputHeight}
          maxLength={256_000}
          editable={ready}
          placeholder={
            running
              ? copy("Sonraki mesajını hazırla…", "Prepare your next message…")
              : copy("Mesaj yaz…", "Write a message…")
          }
          style={{
            flex: 1,
            minWidth: 0,
            height: inputHeight,
            minHeight: minimumInputHeight,
            maxHeight: maximumInputHeight,
            borderWidth: 0,
            backgroundColor: "transparent",
            lineHeight: 22,
            includeFontPadding: false,
            paddingVertical: space.sm,
            paddingHorizontal: space.sm,
          }}
        />
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
          busy={busy || uploading}
          onPress={() => {
            void submit();
          }}
        >
          <ArrowUp size={18} strokeWidth={2.6} color={sendDisabled ? colors.muted : colors.primaryText} />
        </ChatCircleAction>
      </ChatComposerSurface>
      {uploading && !busy ? (
        <Button
          tone="quiet"
          label={copy("Yüklemeyi iptal et", "Cancel upload")}
          onPress={() => transfer.current?.abort()}
        />
      ) : null}
      <ErrorText
        error={error || localError}
        message={composerDeliveryError(error || localError, copy)}
      />
      {!ready && !error ? <Loading /> : null}
      {error ? (
        <Button
          label={
            ready
              ? copy("Taslağı kaydetmeyi yeniden dene", "Retry saving draft")
              : copy("Taslağı yeniden yükle", "Retry loading draft")
          }
          onPress={() => {
            void (ready ? persist() : load()).catch(() => {});
          }}
        />
      ) : null}
      {mode !== "send" || running ? (
        <Body muted style={uiStyles.caption}>
          {mode === "send"
            ? copy("Çalışıyor · sıraya al veya yönlendir.", "Running · choose Queue or Steer.")
            : mode === "steer"
              ? running
                ? copy(
                    "Aktif çalışmayı bu mesajla yönlendirir.",
                    "Redirects the active turn with this message.",
                  )
                : copy(
                    "Yönlendirmek için çalışan bir tur gerekiyor.",
                    "Steering requires a running turn.",
                  )
              : queue.supported
                ? copy(
                    "Bilgisayardaki sıraya kaydedilir. Sıradan başlatabilirsin.",
                    "Saved to the computer’s queue. Start it from the queue.",
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
              trailing={
                option.value === mode ? <Check size={18} strokeWidth={2.4} color={colors.accent} /> : undefined
              }
              onPress={() => {
                setDelivery(option.value);
                setModePicker(false);
              }}
            />
          ))}
        </NavigationGroup>
      </Sheet>
      <Sheet
        visible={picker}
        title={copy("Dosya ekle", "Attach file")}
        size="compact"
        onClose={() => setPicker(false)}
      >
        <NavigationGroup>
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
