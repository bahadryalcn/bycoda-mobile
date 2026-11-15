import { useMobileTheme } from "@/ui/theme";
import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import ListOrdered from "lucide-react-native/icons/list-ordered";
import { Button, ErrorText, StatusText } from "@/ui/primitives";
import { useHostClient } from "@/state/queries";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { moveQueuedMessage, queuedCommand } from "./composer-delivery";
import { queueDeliveryStage } from "./queue-delivery";
import { readSession } from "./session-wire";
import type { SessionCommand, SessionScope } from "./session-types";
import type { useSessionQueue } from "./use-session-queue";
import { composerDeliveryError } from "./composer-delivery-copy";
import { SessionQueueSheet } from "./session-queue-sheet";
import { SessionQueueEditor, useQueueEditor } from "./session-queue-editor";

export function SessionQueue({
  scope,
  queue,
  blocked,
  running,
  onCommand,
}: {
  scope: SessionScope;
  queue: ReturnType<typeof useSessionQueue>;
  blocked: boolean;
  running: boolean;
  onCommand: SessionCommand;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const client = useHostClient();
  const [open, setOpen] = useState(false);
  const { automatic, setAutomatic } = queue;
  const [sending, setSending] = useState(false);
  const [controlling, setControlling] = useState(false);
  const controlPending = useRef(false);
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
  const unconfirmed = rows.some((row) => row.deliveryUnknown);
  const stage = queueDeliveryStage(queue.data);
  // Desktop shows an accepted send briefly. A settlement already present on the first read
  // happened before this screen opened, so it is never announced.
  const [settledBaseline, setSettledBaseline] = useState<string | null>();
  if (queue.data && settledBaseline === undefined)
    setSettledBaseline(queue.data.settled?.token ?? null);
  const [shownAccepted, setShownAccepted] = useState<string>();
  const accepted =
    stage?.stage === "accepted" &&
    settledBaseline !== undefined &&
    stage.token !== settledBaseline &&
    stage.token !== shownAccepted
      ? stage.token
      : undefined;
  // Reason: the delivered confirmation is transient, as on desktop (1.8 s), then the row stays gone.
  useEffect(() => {
    if (!accepted) return;
    const timer = setTimeout(() => setShownAccepted(accepted), 1800);
    return () => clearTimeout(timer);
  }, [accepted]);
  const heldLabel =
    stage?.stage === "stopped"
      ? copy("Yanıtı durdurduğunuz için kuyruk duraklatıldı", "Queue paused because you interrupted")
      : stage?.stage === "rejected"
        ? `${copy("Kuyruk duraklatıldı: son mesaj kabul edilmedi", "Queue paused: the last message was not accepted")}${stage.detail ? ` · ${stage.detail}` : ""}`
        : undefined;
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
      const ready = automaticAttempt ? before.data : await queue.activateForSend();
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
  const queueState = unconfirmed
    ? copy("Kontrol gerekiyor", "Needs review")
    : sending || queue.changing || queue.data?.claim
      ? copy("Bilgisayarın onayı bekleniyor…", "Waiting for the computer to confirm…")
      : heldLabel
        ? heldLabel
      : queue.data?.status !== "active" || queue.data?.editingId
        ? copy("Duraklatıldı", "Paused")
        : running
          ? copy("Turun bitmesini bekliyor", "Waiting for this turn to finish")
          : (queue.data?.consumer && queue.data.consumer !== queue.clientId) ||
              (queue.data?.drain && queue.data.drain.holder !== queue.clientId)
            ? copy(
                "Başka bir istemci sırayı sürdürebilir",
                "Another client may continue this queue",
              )
            : queue.leaseAware || automatic
              ? copy("Etkin", "Active")
              : copy(
                  "Başka bir istemci sırayı sürdürebilir",
                  "Another client may continue this queue",
                );
  return (
    <>
      <View style={{ flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
      {rows.length || accepted || queue.error || queue.changeError || error || editor.value || editor.error || editor.visible ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.xs,
            minHeight: 48,
            flexShrink: 1,
            maxWidth: "100%",
          }}
        >
          {rows.length || queue.error || queue.changeError || error ? (
            <Button
              label={queue.error || error || queue.changeError
                ? `${copy("Sıra", "Queue")} · ${copy("Hata", "Error")}`
                : `${copy("{p0} sırada", "{p0} queued", { p0: rows.length })}${unconfirmed
                  ? ` · ${copy("Kontrol gerekiyor", "Needs review")}`
                  : stage?.stage === "sending"
                    ? ` · ${copy("Gönderiliyor…", "Sending…")}`
                  : sending || queue.changing || queue.data?.claim
                    ? ` · ${queueState}`
                  : stage?.stage === "rejected"
                    ? ` · ${copy("Kabul edilmedi", "Not accepted")}`
                  : queue.data?.status !== "active" || queue.data?.editingId
                    ? ` · ${copy("Duraklatıldı", "Paused")}` : ""}`}
              accessibilityLabel={queue.error ? copy("Sıra yüklenemedi", "Queue unavailable")
                : `${copy("{p0} sırada", "{p0} queued", { p0: rows.length })} · ${queueState}`}
              tone={queue.error || queue.changeError || error || unconfirmed || stage?.stage === "rejected" ? "danger" : "quiet"}
              style={{ minHeight: 48 }}
              onPress={() => setOpen(true)}
            >
              <ListOrdered size={14} color={queue.error || error ? colors.danger : colors.muted} />
            </Button>
          ) : null}
          {accepted ? (
            <StatusText tone="success" label={copy("Mesaj kabul edildi. İlerlemesini konuşmadan takip edebilirsiniz.", "Message accepted. Follow its progress in the conversation.")} />
          ) : null}
          <SessionQueueEditor scope={scope} editor={editor} blocked={blocked || sending || queue.changing} />
        </View>
      ) : null}
      {!open ? <ErrorText error={error} message={composerDeliveryError(error, copy)} /> : null}
      </View>
      <SessionQueueSheet scope={scope} visible={open && !editor.visible}
        state={{ rows, label: queue.leaseAware ? queueState : automatic
          ? copy("Bu ekran açıkken sırayla gönderilir", "Sends in order while this screen is open")
          : queue.data?.status === "active" ? copy("Başka bir istemci sırayı sürdürebilir", "Another client may continue this queue")
            : copy("Duraklatıldı · göndermek için aç", "Paused · open to send"),
          error: queue.error || queue.changeError || error,
          errorMessage: composerDeliveryError(queue.error || queue.changeError || error, copy),
          warning: unconfirmed ? (running
            ? copy("Sağlayıcı henüz yanıt vermedi ve bu mesajı yine de iletebilir. Yeniden göndermek mesajı çoğaltabilir. Bekleyin veya turu durdurun.", "The provider has not answered yet and may still deliver this message. Sending it again could duplicate it. Wait, or stop the turn.")
            : copy("Önce konuşmayı kontrol edin. Yeniden göndermek, iletilmiş bir mesajı çoğaltır. Kuyrukta tutmak kuyruğu duraklatır ve mesajı yeniden göndermez.", "Check the conversation first. Sending again duplicates a message that was delivered. Keeping it queued pauses the queue and does not resend it.")) : undefined,
          sendingId: stage?.stage === "sending" ? stage.id : undefined,
          retryBlocked: running ? copy("Agent çalışırken kullanılamaz", "Not available while the agent is running") : undefined,
          disabled, sending, controlling, reloadBusy: queue.isFetching, queueError: !!queue.error,
          active: automatic || queue.data?.status === "active", canEdit: editor.available,
          hasDraft: !!editor.value || !!editor.error,
          disableSend: disabled || unconfirmed || !!queue.error || !!editor.value || !!editor.error,
          disableControl: disabled || !!queue.error || !!editor.value || ((unconfirmed || !!editor.error) && !automatic && queue.data?.status !== "active"),
        }}
        actions={{close: () => setOpen(false), reload: () => { void queue.refetch(); }, resume: () => editor.open(),
          send: () => { void sendNext(); },
          edit: row => { setAutomatic(false); autoRef.current = false; editor.open(row); },
          move: (id, delta) => { void act(() => queue.change(value => moveQueuedMessage(value, id, delta))); },
          review: (id, outcome) => { void act(async () => {
            if (outcome === "retry" || outcome === "keep") { setAutomatic(false); autoRef.current = false; }
            await queue.resolveDelivery(id, outcome);
            if (outcome === "retry" && !queue.leaseAware) setAutomatic(true);
          }); },
          remove: id => { void act(() => queue.change(value => ({...value, messages: value.messages.filter(entry => entry.id !== id)}))); },
          control: () => {
            if (controlPending.current) return;
            controlPending.current = true; setControlling(true);
            void act(async () => {
              if (automatic || queue.data?.status === "active") { setAutomatic(false); autoRef.current = false; await queue.pause(); }
              else { await queue.activate(); if (!queue.leaseAware) setAutomatic(true); }
            }).finally(() => { controlPending.current = false; if (active.current) setControlling(false); });
          },
        }} />
    </>
  );
}
