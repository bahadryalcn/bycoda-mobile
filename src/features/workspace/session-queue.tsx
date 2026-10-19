import { useMobileTheme } from "@/ui/theme";
import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import ListOrdered from "lucide-react-native/icons/list-ordered";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import Trash2 from "lucide-react-native/icons/trash";
import Pencil from "lucide-react-native/icons/pencil";
import { Body, Button, Empty, ErrorText, Row, Sheet } from "@/ui/primitives";
import { ChatAction } from "@/ui/chat-controls";
import { useHostClient } from "@/state/queries";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { moveQueuedMessage, queuedCommand } from "./composer-delivery";
import { readSession } from "./session-wire";
import type { SessionCommand, SessionScope } from "./session-types";
import type { useSessionQueue } from "./use-session-queue";
import { composerDeliveryError } from "./composer-delivery-copy";
import { SessionQueueEditor, useQueueEditor } from "./session-queue-editor";

export function SessionQueue({
  scope,
  queue,
  blocked,
  onCommand,
}: {
  scope: SessionScope;
  queue: ReturnType<typeof useSessionQueue>;
  blocked: boolean;
  onCommand: SessionCommand;
}) {
  useMobileTheme();
  const copy = useCopy();
  const client = useHostClient();
  const [open, setOpen] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sendingRef = useRef(false);
  const autoRef = useRef(false);
  const editor = useQueueEditor(scope, queue, blocked);
  autoRef.current = automatic;
  const active = useRef(true);
  const pauseRef = useRef(queue.pause);
  pauseRef.current = queue.pause;
  useEffect(() => {
    active.current = true;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" || !autoRef.current) return;
      autoRef.current = false;
      setAutomatic(false);
      void pauseRef.current().catch(() => {});
    });
    return () => {
      active.current = false;
      if (autoRef.current) void pauseRef.current().catch(() => {});
      autoRef.current = false;
      listener.remove();
    };
  }, []);
  const rows = queue.data?.messages ?? [];
  const act = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (cause) {
      if (active.current) setError(cause);
    }
  };
  const sendNext = async (automaticAttempt = false) => {
    if (
      !client ||
      blocked ||
      sendingRef.current ||
      queue.changing ||
      !active.current ||
      AppState.currentState !== "active"
    )
      return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      // Check live host state at dispatch time, rather than a stale idle poll.
      const session = await readSession(client, scope.sessionId);
      if (!active.current) return;
      if (session.status === "running") {
        if (!automaticAttempt)
          throw new Error("Wait for this turn, queue your message, or choose Steer.");
        return;
      }
      if (automaticAttempt && session.status === "interrupted") {
        await queue.pause();
        setAutomatic(false);
        return;
      }
      const before = await queue.refetch();
      if (before.error) throw before.error;
      if (!before.data?.messages.length) {
        setAutomatic(false);
        return;
      }
      if (
        automaticAttempt &&
        (before.data.consumer !== queue.clientId || before.data.status !== "active")
      ) {
        setAutomatic(false);
        return;
      }
      const ready = automaticAttempt ? before.data : await queue.activate();
      if (!active.current || (automaticAttempt && !autoRef.current)) return;
      await onCommand(queuedCommand(ready, session, queue.clientId));
      if (!automaticAttempt) await queue.pause();
      await queue.refetch();
    } catch (cause) {
      if (active.current) {
        setError(cause);
        setAutomatic(false);
      }
      // Never retry a command automatically after ambiguous delivery. Its receipt
      // is reconciled by the existing command recovery UI and the host owns removal.
    } finally {
      sendingRef.current = false;
      if (active.current) setSending(false);
    }
  };
  const nextRef = useRef(sendNext);
  nextRef.current = sendNext;
  useEffect(() => {
    if (!automatic) return;
    void nextRef.current(true);
    const timer = setInterval(() => {
      void nextRef.current(true);
    }, 2500);
    return () => clearInterval(timer);
  }, [automatic]);
  if (!queue.supported) return null;
  const disabled = blocked || queue.changing || sending;
  return (
    <>
      {rows.length || queue.error || error ? (
        <>
          <View style={{ flexDirection: "row" }}>
            <Button
              label={
                queue.error
                  ? copy("Sıra yüklenemedi", "Queue unavailable")
                  : copy("{p0} sırada", "{p0} queued", { p0: rows.length })
              }
              density="compact"
              tone="secondary"
              onPress={() => setOpen(true)}
            >
              <ListOrdered size={15} strokeWidth={2.2} color={colors.accent} />
            </Button>
          </View>
          <ErrorText error={error} message={composerDeliveryError(error, copy)} />
        </>
      ) : null}
      <Sheet
        visible={open && !editor.visible}
        title={copy("Mesaj sırası", "Message queue")}
        size="form"
        onClose={() => setOpen(false)}
      >
        <Body muted style={uiStyles.caption}>
          {automatic
            ? copy("Bu ekran açıkken sırayla gönderilir", "Sends in order while this screen is open")
            : queue.data?.status === "active"
              ? copy(
                  "Başka bir istemci sırayı sürdürebilir",
                  "Another client may continue this queue",
                )
              : copy("Duraklatıldı · göndermek için aç", "Paused · open to send")}
        </Body>
        <ErrorText
          error={queue.error || queue.changeError || error}
          message={composerDeliveryError(queue.error || queue.changeError || error, copy)}
        />
        {queue.error ? (
          <Button
            label={copy("Sırayı yeniden yükle", "Reload queue")}
            onPress={() => {
              void queue.refetch();
            }}
          />
        ) : null}
        {editor.value ? (
          <Button
            label={copy("Düzenlemeye devam et", "Continue editing")}
            disabled={disabled}
            onPress={() => editor.open()}
          />
        ) : null}
        {rows.length ? (
          <Row>
            <Button
              label={copy("Sonrakini gönder", "Send next")}
              disabled={disabled || !!queue.error || !!editor.value}
              busy={sending}
              onPress={() => {
                void sendNext();
              }}
            />
            <Button
              label={
                automatic || queue.data?.status === "active"
                  ? copy("Sırayı duraklat", "Pause queue")
                  : copy("Sırayı başlat", "Start queue")
              }
              disabled={disabled || !!queue.error || !!editor.value}
              onPress={() => {
                void act(async () => {
                  if (automatic || queue.data?.status === "active") {
                    setAutomatic(false);
                    autoRef.current = false;
                    await queue.pause();
                  } else {
                    await queue.activate();
                    setAutomatic(true);
                  }
                });
              }}
            />
          </Row>
        ) : (
          <Empty compact title={copy("Sıra boş", "Queue is empty")} />
        )}
        {rows.map((row, index) => (
          <View
            key={row.id}
            style={{
              gap: space.sm,
              paddingVertical: space.md,
              borderBottomWidth: 1,
              borderBottomColor: colors.separator,
            }}
          >
            <Row style={{ justifyContent: "space-between" }}>
              <Body muted style={uiStyles.caption}>
                {index + 1} · {row.modelTarget?.model ?? ""}
              </Body>
              <Row style={{ gap: space.xxs }}>
                <ChatAction
                  label={copy("Sırayı duraklat ve düzenle", "Pause queue and edit")}
                  disabled={disabled || !editor.available || !!queue.error}
                  onPress={() => {
                    setAutomatic(false);
                    autoRef.current = false;
                    editor.open(row);
                  }}
                >
                  <Pencil size={17} color={colors.muted} />
                </ChatAction>
                <ChatAction
                  label={copy("Yukarı taşı", "Move up")}
                  disabled={disabled || !!editor.value || index === 0}
                  onPress={() => {
                    void act(() => queue.change((value) => moveQueuedMessage(value, row.id, -1)));
                  }}
                >
                  <ArrowUp size={17} color={colors.muted} />
                </ChatAction>
                <ChatAction
                  label={copy("Aşağı taşı", "Move down")}
                  disabled={disabled || !!editor.value || index === rows.length - 1}
                  onPress={() => {
                    void act(() => queue.change((value) => moveQueuedMessage(value, row.id, 1)));
                  }}
                >
                  <ArrowDown size={17} color={colors.muted} />
                </ChatAction>
                <ChatAction
                  label={copy("Sıradan kaldır", "Remove from queue")}
                  disabled={disabled || !!editor.value}
                  onPress={() => {
                    void act(() =>
                      queue.change((value) => ({
                        ...value,
                        messages: value.messages.filter((entry) => entry.id !== row.id),
                      })),
                    );
                  }}
                >
                  <Trash2 size={17} color={colors.danger} />
                </ChatAction>
              </Row>
            </Row>
            <Body selectable>{row.text}</Body>
            {row.attachments.map((file) => (
              <Body key={file.id} muted style={uiStyles.caption}>
                {file.name} · {Math.ceil(file.size / 1024)} KB
              </Body>
            ))}
            {row.attachments.length ? (
              <Body muted style={uiStyles.caption}>
                {copy(
                  "Dosyalar mesaj gönderildikten sonra açılabilir.",
                  "Files can be opened after the queued message is sent.",
                )}
              </Body>
            ) : null}
          </View>
        ))}
      </Sheet>
      <SessionQueueEditor editor={editor} blocked={blocked || sending || queue.changing} />
    </>
  );
}
