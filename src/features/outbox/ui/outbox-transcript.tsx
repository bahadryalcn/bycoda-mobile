import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ActionMenu, Body, ErrorText } from "@/ui/primitives";
import { TextAction } from "@/ui/feedback";
import { ChatMessage, chatUserBubbleStyle } from "@/ui/chat";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import type { SessionScope } from "../../workspace/session-types";
import type { Block } from "../../workspace/wire";
import { PENDING_SWEEP_MS, PendingUserMessage } from "../../workspace/user-turn-notice";
import { LocalMessageAttachments, UserMediaColumn } from "../../workspace/transcript-attachments";
import { outboxNoticeKind, outboxOwned, type OutboxRow } from "../model/outbox";
import { bridgeDeliveredOutboxRows, DELIVERED_GRACE_MS, outboxBubble, pendingOutboxRows } from "../../workspace/transcript-model";
import { useAccount } from "@/features/account/ui/account-context";
import { sendOutbox } from "../runtime/store";
import { editOutbox } from "../runtime/composer-edit";
import { lockOutbox } from "../runtime/delivery";
import { retryOutbox } from "../runtime/coordinator";
import { cleanOutboxFiles } from "../runtime/custody";
import { useMachines } from "@/state/machines";
import { attachmentReleases } from "../../workspace/attachment-ownership";

/**
 * A message on its way to the computer, shown where it will land: the user's own bubble, its words
 * sweeping until the Host acknowledges it (only the latest moves, for at most PENDING_SWEEP_MS). The
 * composer's write-ahead row reads as that same pending bubble while its send runs (see `outboxBubble`). The
 * Host's block for the same command id replaces it, so the two never show together; a delivered row
 * custody already removed stays, from this screen's memory only, until that block arrives. A message that
 * keeps waiting or stopped says why under its bubble, with Retry; Edit and Delete sit in its menu.
 * Transcript footer; uses the transcript's scroll owner. No nested list.
 */
/** A row this screen may still show after custody removed it: delivered, awaiting the Host's block. */
type ShownRow = OutboxRow & { deliveredAt?: number };

/**
 * Whether a send for this session holds its outbox lock now: the composer's write-ahead row while
 * the Host has not answered, or a replay. Probing takes and returns the lock in one synchronous step.
 */
function outboxLocked(scope: SessionScope) {
  const unlock = lockOutbox(scope);
  if (!unlock) return true;
  unlock();
  return false;
}

export function OutboxTranscript({ scope, blocked = false, blocks }: { scope: SessionScope; blocked?: boolean; blocks?: readonly Block[] }) {
  const copy = useCopy();
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const account = useAccount();
  const machines = useMachines(state => state.machines);
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Rows seen delivered, by id; never written back, so outbox custody and its durability are unchanged.
  const delivered = useRef(new Map<string, ShownRow>());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    // Durable outbox changes update only the matching conversation footer.
    let mounted = true;
    const load = () => { void sendOutbox.read(scope.machineId, scope.sessionId).then(value => {
      if (!mounted) return;
      const at = Date.now();
      bridgeDeliveredOutboxRows<ShownRow>(delivered.current, value, at);
      setNow(at);
      setRows(value);
    }).catch(cause => { if (mounted) setError(cause); }); };
    setRows([]);
    delivered.current.clear();
    setDismissed(new Set());
    load();
    const unsubscribe = sendOutbox.subscribe(load);
    return () => { mounted = false; unsubscribe(); };
  }, [scope.machineId, scope.sessionId]);
  const change = (row: OutboxRow, edit: boolean) => {
    // A delivered message is the Host's now: Delete only hides this bridge, never releases its files.
    if (row.status === "delivered") {
      delivered.current.delete(row.id);
      setDismissed(current => new Set(current).add(row.id));
      return;
    }
    const unlock = lockOutbox(row);
    if (!unlock) return;
    setBusy(true);
    void (async () => {
      if (edit) await editOutbox(row);
      const machine = useMachines.getState().machines.find(machine => machine.id === row.machineId && machine.environmentId === row.environmentId);
      if (!edit && machine) await attachmentReleases.stage({ machine }, row.sessionId, row.draft.attachments);
      await sendOutbox.remove(row);
      if (!edit) await cleanOutboxFiles(row).catch(() => {});
      setError(null);
    })().catch(setError).finally(() => { unlock(); setBusy(false); });
  };
  const owns = (row: OutboxRow) => outboxOwned(row, account.device?.id, machines.find(machine => machine.id === row.machineId)?.environmentId);
  const notice = (row: OutboxRow) => {
    const kind = outboxNoticeKind(row, owns(row));
    if (kind === "foreign") return copy("Gönderilmedi: başka bir hesaba veya bilgisayara ait", "Not sent: belongs to another account or computer");
    if (kind === "unavailable") return copy("Gönderilmedi: oturum kullanılamıyor; metin saklandı", "Not sent: session unavailable; text kept");
    if (kind === "expired") return copy("24 saatten uzun bekledi; otomatik gönderilmedi", "Waited over 24 hours; not sent automatically");
    if (kind === "blocked") return copy("Gönderim durduruldu; oturumu ve izinleri kontrol et", "Delivery paused; check the session and permissions");
    return copy("Gönderilmeyi bekliyor", "Waiting to send");
  };
  const locked = outboxLocked(scope);
  const newest = rows.at(-1);
  const bubbles = pendingOutboxRows(bridgeDeliveredOutboxRows<ShownRow>(delivered.current, rows, now), blocks, now)
    .filter(row => !dismissed.has(row.id))
    .map(row => {
      const kind = outboxNoticeKind(row, owns(row));
      return { row, kind, bubble: outboxBubble(row, { notice: kind, locked, newest: row.id === newest?.id, now, sweepMs: PENDING_SWEEP_MS }) };
    })
    .filter(entry => !entry.bubble.hidden);
  const visible = bubbles.map(entry => entry.row);
  // A waiting message says "Waiting to send" only once its sweep has ended, and a delivered bridge
  // ends with its grace; re-render at the next such moment.
  const nextStale = visible
    .map(row => row.status === "delivered" ? (row.deliveredAt ?? row.createdAt) + DELIVERED_GRACE_MS : row.createdAt + PENDING_SWEEP_MS)
    .filter(at => at > now)
    .sort((a, b) => a - b)[0];
  useEffect(() => {
    if (nextStale === undefined) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextStale - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [nextStale]);
  const latest = visible.at(-1);
  if (!visible.length && !error) return null;
  return <UserMediaColumn style={{ gap: space.row }}>
    {bubbles.map(({ row, kind, bubble }) => {
      const files = row.draft.attachments.map(file => file.name).join(", ");
      const preview = [row.draft.text.trim(), files].filter(Boolean).join(" · ");
      const waiting = kind === "waiting";
      // A delivered row only waits for the Host's block, and a row in flight is still sending: neither
      // reads "Waiting to send" nor "Delivery paused".
      const caption = bubble.caption ? notice(row) : undefined;
      const ink = waiting ? colors.muted : semanticColors.warning.text;
      const retry = bubble.retry && !blocked && !busy;
      return <View key={row.id} style={{ alignSelf: "flex-end", maxWidth: "85%", gap: space.xxs }}>
        <LocalMessageAttachments files={row.draft.attachments} delivered={row.status === "delivered"} />
        {row.draft.text.trim() ? (
          <ChatMessage role="user" style={{ ...chatUserBubbleStyle(colors), alignSelf: "stretch", maxWidth: "100%", gap: space.xs }}>
            <PendingUserMessage text={row.draft.text} since={row.createdAt} sweep={bubble.pending && row === latest} />
          </ChatMessage>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", columnGap: space.md }}>
          {caption ? (
            <Body accessibilityLiveRegion="polite" style={[uiStyles.caption, { color: ink, flexShrink: 1, textAlign: "right" }]}>
              {caption}
            </Body>
          ) : null}
          {retry ? <TextAction label={copy("Yeniden dene", "Retry")} color={colors.accent} onPress={() => retryOutbox(row.sessionId)} /> : null}
          {bubble.actions ? (
            <ActionMenu
              label={copy("Bekleyen mesaj", "Waiting message")}
              subtitle={preview || row.model.model}
              reserveTouchTarget
              busy={busy}
              actions={[
                owns(row) && row.status !== "delivered" && { key: "edit", label: copy("Düzenle", "Edit"), disabled: blocked || busy, onPress: () => change(row, true) },
                { key: "delete", label: copy("Sil", "Delete"), destructive: true, disabled: busy, onPress: () => change(row, false) },
              ]}
            />
          ) : null}
        </View>
      </View>;
    })}
    {error ? <ErrorText error={error} /> : null}
  </UserMediaColumn>;
}
