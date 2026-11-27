import { useMobileTheme } from "@/ui/theme";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import ListOrdered from "lucide-react-native/icons/list-ordered";
import { Button, ErrorText, StatusText } from "@/ui/primitives";
import { useQueryClient } from "@tanstack/react-query";
import { hostKey, useHostClient } from "@/state/queries";
import { isTransientConnectionError, visibleReadError } from "@/state/query-retry";
import { useReadRetryNotice } from "@/ui/query-state";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { moveQueuedMessage, queuedCommand } from "./composer-delivery";
import { queueDeliveryStage } from "./queue-delivery";
import { readSession } from "./session-wire";
import { AUTO_SEND_SAFETY_MS, automaticAttemptCanWait } from "./queue-auto-send";
import type { HostSession } from "./wire";
import type { SessionCommand, SessionScope } from "./session-types";
import type { useSessionQueue } from "./use-session-queue";
import { composerDeliveryError } from "./composer-delivery-copy";
import { SessionQueueSheet } from "./session-queue-sheet";
import { SessionQueueEditor, useQueueEditor } from "./session-queue-editor";
import { useStatusClusterPresent, useStatusClusterQueueSink } from "./session-status-cluster-context";

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
  const cache = useQueryClient();
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
  // Send controls still respect queue.error; only the red state waits out a brief link drop.
  const readGraceElapsed = useReadRetryNotice(isTransientConnectionError(queue.error), scope.machineId);
  const queueReadError = visibleReadError(queue.error, readGraceElapsed);
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
      ? copy("Yanıtı durdurduğun için sıra duraklatıldı", "Queue paused because you interrupted")
      : stage?.stage === "rejected"
        ? `${copy("Sıra duraklatıldı: son mesaj kabul edilmedi", "Queue paused: the last message was not accepted")}${stage.detail ? ` · ${stage.detail}` : ""}`
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
    // The open transcript's stream or snapshot poll already owns this session's status.
    const snapshotKey = hostKey(scope.machineId, ["session", scope.sessionId]);
    const known = cache.getQueryData<HostSession>(snapshotKey);
    if (
      automaticAttempt &&
      automaticAttemptCanWait(
        known,
        cache.getQueryState(snapshotKey)?.dataUpdatedAt ?? 0,
        Date.now(),
      )
    )
      return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      // Check live host state at dispatch time, rather than a stale idle snapshot. A known
      // transcript syncs by revision (usually "unchanged"); without one this is a tail read.
      const session = await readSession(
        client,
        scope.sessionId,
        known?.session.id === scope.sessionId ? known : undefined,
      );
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
  // Reason: the idle flip in the shared snapshot starts an attempt at once; the slow timer is a
  // safety net. Both go through sendNext, so single-flight and the live check stay authoritative.
  useEffect(() => {
    if (!automatic) return;
    void nextRef.current(true);
    const timer = setInterval(() => {
      void nextRef.current(true);
    }, AUTO_SEND_SAFETY_MS);
    return () => clearInterval(timer);
  }, [automatic, running]);
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
  const countShown = queue.supported && !!(rows.length || queueReadError || queue.changeError || error);
  // "Messages", so the count never reads like the subagents segment's "2 queued" beside it.
  const queuedText = rows.length === 1
    ? copy("1 mesaj sırada", "1 message queued")
    : copy("{p0} mesaj sırada", "{p0} messages queued", { p0: rows.length });
  const countText = queueReadError || error || queue.changeError
    ? `${copy("Sıra", "Queue")} · ${copy("Hata", "Error")}`
    : `${queuedText}${unconfirmed
      ? ` · ${copy("Kontrol gerekiyor", "Needs review")}`
      : stage?.stage === "sending"
        ? ` · ${copy("Gönderiliyor…", "Sending…")}`
      : sending || queue.changing || queue.data?.claim
        ? ` · ${queueState}`
      : stage?.stage === "rejected"
        ? ` · ${copy("Kabul edilmedi", "Not accepted")}`
      : queue.data?.status !== "active" || queue.data?.editingId
        ? ` · ${copy("Duraklatıldı", "Paused")}` : ""}`;
  const countLabel = queueReadError ? copy("Sıra yüklenemedi", "Queue unavailable")
    : `${queuedText} · ${queueState}`;
  const countDanger = !!(queueReadError || queue.changeError || error || unconfirmed || stage?.stage === "rejected");
  // Inside a session screen the floating status cluster shows the count and opens this queue's sheet.
  const summarySink = useStatusClusterQueueSink();
  const openQueue = useCallback(() => setOpen(true), []);
  useEffect(() => {
    summarySink?.(countShown ? { text: countText, label: countLabel, danger: countDanger, open: openQueue } : null);
  }, [summarySink, countShown, countText, countLabel, countDanger, openQueue]);
  useEffect(() => () => summarySink?.(null), [summarySink]);
  // Without the cluster on screen (cited-turn search, repair, a failed transcript) the count stays here.
  const clusterShown = useStatusClusterPresent();
  const localCount = countShown && !clusterShown;
  if (!queue.supported) return null;
  const disabled = blocked || queue.changing || sending;
  return (
    <>
      <View style={{ flexShrink: 1, minWidth: 0, maxWidth: "100%" }}>
      {localCount || accepted || editor.value || editor.error || editor.visible ? (
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
          {localCount ? (
            <Button
              label={countText}
              accessibilityLabel={countLabel}
              tone={countDanger ? "danger" : "quiet"}
              style={{ minHeight: 48 }}
              onPress={() => setOpen(true)}
            >
              <ListOrdered size={14} color={queueReadError || error ? colors.danger : colors.muted} />
            </Button>
          ) : null}
          {accepted ? (
            <StatusText tone="success" label={copy("Mesaj kabul edildi. İlerlemesini oturumdan takip edebilirsin.", "Message accepted. Follow its progress in the session.")} />
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
          error: queueReadError || queue.changeError || error,
          errorMessage: composerDeliveryError(queueReadError || queue.changeError || error, copy),
          warning: unconfirmed ? (running
            ? copy("Sağlayıcı henüz yanıt vermedi ve bu mesajı yine de iletebilir. Yeniden göndermek mesajı çoğaltabilir. Bekle veya turu durdur.", "The provider has not answered yet and may still deliver this message. Sending it again could duplicate it. Wait, or stop the turn.")
            : copy("Önce oturumu kontrol et. Yeniden göndermek, iletilmiş bir mesajı çoğaltır. Sırada tutmak sırayı duraklatır ve mesajı yeniden göndermez.", "Check the session first. Sending again duplicates a message that was delivered. Keeping it queued pauses the queue and does not resend it.")) : undefined,
          sendingId: stage?.stage === "sending" ? stage.id : undefined,
          retryBlocked: running ? copy("Ajan çalışırken kullanılamaz", "Not available while the agent is running") : undefined,
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
