import { useEffect, useState } from "react";
import { View } from "react-native";
import { ActionMenu, Body, ErrorText } from "@/ui/primitives";
import { StatusLine } from "@/ui/feedback";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import type { SessionScope } from "../../workspace/session-types";
import { outboxNoticeKind, outboxOwned, type OutboxRow } from "../model/outbox";
import { useAccount } from "@/features/account/ui/account-context";
import { sendOutbox } from "../runtime/store";
import { editOutbox } from "../runtime/composer-edit";
import { lockOutbox } from "../runtime/delivery";
import { retryOutbox } from "../runtime/coordinator";
import { cleanOutboxFiles } from "../runtime/custody";
import { useMachines } from "@/state/machines";
import { attachmentReleases } from "../../workspace/attachment-ownership";

/** Transcript footer; uses the transcript's scroll owner. No nested list. */
export function OutboxTranscript({ scope, blocked = false }: { scope: SessionScope; blocked?: boolean }) {
  const copy = useCopy();
  const account = useAccount();
  const machines = useMachines(state => state.machines);
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Durable outbox changes update only the matching conversation footer.
    let mounted = true;
    const load = () => { void sendOutbox.read(scope.machineId, scope.sessionId).then(value => { if (mounted) setRows(value); }).catch(cause => { if (mounted) setError(cause); }); };
    setRows([]);
    load();
    const unsubscribe = sendOutbox.subscribe(load);
    return () => { mounted = false; unsubscribe(); };
  }, [scope.machineId, scope.sessionId]);
  const change = (row: OutboxRow, edit: boolean) => {
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
    if (kind === "unavailable") return copy("Gönderilmedi: konuşma kullanılamıyor; metin saklandı", "Not sent: conversation unavailable; text kept");
    if (kind === "expired") return copy("24 saatten uzun bekledi; otomatik gönderilmedi", "Waited over 24 hours; not sent automatically");
    if (kind === "blocked") return copy("Gönderim durduruldu; konuşmayı ve izinleri kontrol et", "Delivery paused; check the conversation and permissions");
    return copy("Gönderilmeyi bekliyor", "Waiting to send");
  };
  // One status line per waiting message: Retry is its action; Edit and Delete sit in its menu.
  return <View style={{ gap: space.xs }}>
    {rows.filter(row => row.status !== "delivered").map(row => {
      const kind = outboxNoticeKind(row, owns(row));
      const preview = [row.draft.text.trim(), row.draft.attachments.map(file => file.name).join(", ")].filter(Boolean).join(" · ");
      return <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <StatusLine
            tone={kind === "waiting" ? "info" : "warning"}
            busy={kind === "waiting" && busy}
            label={notice(row)}
            action={row.status !== "dropped" && !blocked && !busy ? { label: copy("Yeniden dene", "Retry"), onPress: () => retryOutbox(row.sessionId) } : undefined}
          />
          {preview ? <Body muted numberOfLines={1}>{preview}</Body> : null}
        </View>
        <ActionMenu
          label={copy("Bekleyen mesaj", "Waiting message")}
          subtitle={preview || row.model.model}
          reserveTouchTarget
          busy={busy}
          actions={[
            owns(row) && { key: "edit", label: copy("Düzenle", "Edit"), disabled: blocked || busy, onPress: () => change(row, true) },
            { key: "delete", label: copy("Sil", "Delete"), destructive: true, disabled: busy, onPress: () => change(row, false) },
          ]}
        />
      </View>;
    })}
    {error ? <ErrorText error={error} /> : null}
  </View>;
}
