import { useEffect, useState } from "react";
import { View } from "react-native";
import { Body, Button, ErrorText, Notice } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import type { SessionScope } from "../../workspace/session-types";
import { type OutboxRow } from "../model/outbox";
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
  return <View style={{ gap: space.sm }}>
    {rows.filter(row => row.status !== "delivered").map(row => <View key={row.id} style={{ gap: space.xs }}>
      <Notice message={row.status === "dropped"
        ? copy("Mesaj gönderilmedi: hesap veya konuşma artık kullanılamıyor ya da bekleme süresi doldu.", "Message not sent: account or conversation is unavailable, or waiting time expired.")
        : row.status === "blocked"
          ? copy("Gönderim durduruldu. Yeniden denemeden önce konuşmayı ve izinleri kontrol et.", "Delivery paused. Check the conversation and permissions before retrying.")
          : copy("Gönderilmeyi bekliyor", "Waiting to send")} />
      <Body>{row.draft.text}</Body>
      <Body muted>{row.model.model}{row.draft.attachments.length ? ` · ${row.draft.attachments.map(file => file.name).join(", ")}` : ""}</Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {row.status !== "dropped" ? <Button label={copy("Şimdi yeniden dene", "Retry now")} disabled={blocked || busy} onPress={() => retryOutbox(row.sessionId)} /> : null}
        {row.status !== "dropped" ? <Button label={copy("Düzenle", "Edit")} disabled={blocked || busy} onPress={() => change(row, true)} /> : null}
        <Button label={copy("Sil", "Delete")} tone="danger" disabled={busy} onPress={() => change(row, false)} />
      </View>
    </View>)}
    {error ? <ErrorText error={error} /> : null}
  </View>;
}
