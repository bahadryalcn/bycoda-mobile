import { useMobileTheme } from "@/ui/theme";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Plus from "lucide-react-native/icons/plus";
import X from "lucide-react-native/icons/x";
import Check from "lucide-react-native/icons/check";
import { randomUUID } from "expo-crypto";
import ImageIcon from "lucide-react-native/icons/image";
import File from "lucide-react-native/icons/file";
import { useHostClient } from "@/state/queries";
import { useMachines } from "@/state/machines";
import { Body, Button, Row, Stack, NavigationGroup, NavigationRow, Sheet } from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { colors, space } from "@/ui/tokens";
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
import { useComposerSuggestions } from "./use-composer-suggestions";
import { useComposerDelivery } from "./use-composer-delivery";
import { useComposerAttachments } from "./use-composer-attachments";
import { useMounted } from "@/state/use-mounted";
import { ComposerSuggestions } from "./composer-suggestions";
import { ComposerAttachments } from "./composer-attachments";
import { removeStagedFile, stageBrowserCapture } from "./attachment-files";
import { ATTACHMENT_COUNT, type StagedAttachment } from "./attachment-model";
import {
  attachmentReleases,
  composerDraftKey,
  supportsAttachmentOwnership,
} from "./attachment-ownership";
import { ChatCircleAction, ChatToolbarAction } from "@/ui/chat-controls";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import { ChatComposer } from "@/ui/chat-composer";
import { ComposerActionsProvider } from "@/ui/composer-actions";
import { composerInputLimits, composerSuggestionLimits, COMPOSER_LINE_HEIGHT } from "@/ui/chat-composer-model";
import { haptic } from "@/ui/motion";
import { composerCommand, queuedComposerMessage, validateNoteDelivery } from "./composer-delivery";
import { useSessionQueue } from "./use-session-queue";
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
  const submission = useRef(false);
  const queuedDraft = useRef<QueuedComposerDraft | null>(null);
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const availableHeight = use(SessionKeyboardSpace);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [picker, setPicker] = useState(false);
  const [templatePicker, setTemplatePicker] = useState(false);
  const templateDestination = useRef<{ machineId: string; sessionId: string } | null>(null);
  const [modePicker, setModePicker] = useState(false);
  const [retryingDraft, setRetryingDraft] = useState(false);
  const [localError, setLocalError] = useState<unknown>(null);
  const mounted = useMounted();
  const [prefixHeight, measurePrefix] = useComposerHeight();
  const [footerHeight, measureFooter] = useComposerHeight();
  const [toolbarHeight, measureToolbar] = useComposerHeight();
  const [suggestionsHeight, measureSuggestions] = useComposerHeight();
  const suggestionLimits = composerSuggestionLimits(windowHeight, availableHeight, fontScale, prefixHeight, footerHeight, toolbarHeight);
  const draftKey = composerDraftKey(scope.machineId, scope.sessionId);
  const draft = useLocalDraft(draftKey, decodeComposerDraft, encodeComposerDraft);
  const { ready, isStored, persist, load, setValue, valueRef, error } = draft;
  const composerTransfer = useComposerTransfer();
  const value = draft.value ?? emptyComposerDraft();
  const prompt = value.text;
  const delivery = useComposerDelivery({ session, client, queueSupported: queue.supported });
  const { mode, running, supportsSteer, desktopOwned, canSteer } = delivery;
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
  const inputLimits = composerInputLimits(windowHeight, availableHeight, fontScale, prefixHeight + suggestionPrefix, footerHeight, toolbarHeight);
  const minimumInputHeight = inputLimits.minimum;
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
    uploads.begin(controller);
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
    <ComposerActionsProvider><View
      style={{
        paddingVertical: space.sm,
        gap: 0,
        backgroundColor: colors.background,
      }}
    >
      {token ? (
        <View onLayout={measureSuggestions} style={{marginBottom:space.xs}}>
          <ComposerSuggestions
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
      <View onLayout={measurePrefix} style={{gap:space.xs,marginBottom:prefixHeight>0?space.xs:0}}>
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
            void uploads.retry(file);
          }}
          onRemove={uploads.remove}
        />
      ) : null}
      </View>
      <SessionQueue
        scope={scope}
        queue={queue}
        blocked={blocked || unavailable}
        running={running}
        onCommand={onCommand}
      />
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
        mode={
          delivery.showModeChip ? (
            <ChatToolbarAction
              label={delivery.modeLabel}
              accessibilityLabel={`${copy("Gönderme biçimi", "Delivery mode")}: ${delivery.modeLabel}`}
              disabled={unavailable}
              onPress={() => setModePicker(true)}
            >
              <ChevronDown size={12} color={colors.muted} />
            </ChatToolbarAction>
          ) : undefined
        }
        leading={
          <ChatCircleAction
            label={compactSuggestions ? copy("Kapat", "Close") : copy("Mesaja ekle", "Add to message")}
            disabled={compactSuggestions ? false : unavailable}
            busy={compactSuggestions ? false : picking}
            onPress={compactSuggestions ? suggestions.close : () => setPicker(true)}
          >
            {compactSuggestions ? <X size={19} strokeWidth={2.4} color={colors.text} /> : <Plus size={19} strokeWidth={2.4} color={colors.text} />}
          </ChatCircleAction>
        }
        field={{
          accessibilityLabel: copy("Mesaj", "Message"),
          selection,
          onSelectionChange: (event) => setSelection(event.nativeEvent.selection),
          onKeyPress: suggestions.onKeyPress,
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
            lineHeight: COMPOSER_LINE_HEIGHT,
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
      <View onLayout={measureFooter} style={{gap:space.xs,marginTop:footerHeight>0?space.xs:0}}>
      {uploading && Object.values(transfers).some((state) => state.status === "uploading") ? (
        <Button
          tone="quiet"
          density="compact"
          label={copy("Yüklemeyi iptal et", "Cancel upload")}
          onPress={uploads.cancel}
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
      </View>
      <Sheet
        visible={modePicker}
        title={copy("Gönderme biçimi", "Delivery mode")}
        size="compact"
        onClose={() => setModePicker(false)}
      >
        <NavigationGroup>
          {delivery.options.map((option) => (
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
                delivery.choose(option.value);
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
                throw new Error(copy(
                  "Bu konuşmaya şu anda ekleme yapılamıyor. Taslağınız değişmedi.",
                  "This conversation is not available for insertion. Your draft is unchanged.",
                ));
              const current = valueRef.current ?? emptyComposerDraft();
              const result = insertTemplate(current.text, selection, body);
              if (result.text.length > 256_000) {
                throw new Error(copy("Mesaj çok uzun.", "The message is too long."));
              }
              setValue({ ...current, text: result.text });
              setSelection(result.selection);
              suggestions.reopen();
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
              setPicker(false);
              void uploads.choose("photo");
            }}
          />
          <NavigationRow
            label={copy("Dosyalar", "Files")}
            icon={<File size={22} color={colors.text} />}
            onPress={() => {
              setPicker(false);
              void uploads.choose("document");
            }}
          />
        </NavigationGroup>
      </Sheet>
    </View></ComposerActionsProvider>
  );
}

function useComposerHeight() {
  const [height,setHeight]=useState(0);
  const onLayout=useCallback((event:LayoutChangeEvent)=>{
    const next=event.nativeEvent.layout.height;
    if(Number.isFinite(next)&&next>=0)setHeight(previous=>previous===Math.ceil(next)?previous:Math.ceil(next));
  },[]);
  return [height,onLayout] as const;
}
