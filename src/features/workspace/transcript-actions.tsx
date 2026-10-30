import { useRef, useState } from "react";
import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { Button, ErrorText, NavigationGroup, NavigationRow, Sheet } from "@/ui/primitives";
import { RemoteHostError } from "@/remote/transport";
import { useSingleFlight } from "@/state/actions";
import type { MessageContext } from "@/ui/media-policy";
import { useCopy } from "@/ui/copy";
import { startContentReport } from "../reporting/report-store";
import { SelectedText } from "./selected-text";
import { useComposerTransfer } from "./composer-transfer";

export function TranscriptActions({ text, responseText, context, reportable, onClose }: { text: string; responseText?: string; context?: MessageContext; reportable: boolean; onClose: () => void }) {
  const copy = useCopy(); const [error, setError] = useState<unknown>(null); const [pendingAction, setPendingAction] = useState<string>(); const busy = !!pendingAction; const flight = useSingleFlight<void>(); const [saved, setSaved] = useState(false);
  const noteId = useRef(randomUUID());
  const bridge = useComposerTransfer();
  const [selecting, setSelecting] = useState(false);
  const uncertain = error instanceof RemoteHostError && error.uncertain;
  // One synchronous owner for every message action (copy, share, note, check): a second press joins the first.
  const act = (key: string, action: () => Promise<unknown>) => { void flight.run(async () => {
    setPendingAction(key); setError(null);
    try { await action(); } catch (cause) { setError(cause); } finally { setPendingAction(undefined); }
  }); };
  if (selecting && context?.sessionId) return <SelectedText text={text} scope={{ machineId: context.machineId, sessionId: context.sessionId }} onClose={onClose} />;
  return <Sheet visible title={copy("Mesaj seçenekleri", "Message options")} size="compact" dismissible={!busy} onClose={onClose}><NavigationGroup>
    {bridge && context?.sessionId ? <NavigationRow label={copy("Metin seç", "Select excerpt")} disabled={busy} onPress={() => setSelecting(true)} /> : null}
    <NavigationRow label={copy("Mesajı kopyala", "Copy message")} disabled={busy} busy={pendingAction === "copy"} onPress={() => act("copy", async () => { await Clipboard.setStringAsync(text); onClose(); })} />
    {responseText && responseText !== text ? <NavigationRow label={copy("Yanıtın tamamını kopyala", "Copy complete response")} disabled={busy} busy={pendingAction === "response"} onPress={() => act("response", async () => { await Clipboard.setStringAsync(responseText); onClose(); })} /> : null}
    <NavigationRow label={copy("Paylaş", "Share")} disabled={busy} busy={pendingAction === "share"} onPress={() => act("share", () => Share.share({ message: text }))} />
    {context ? <NavigationRow label={saved ? copy("Nota kaydedildi", "Saved to notes") : copy("Not olarak kaydet", "Save as note")} disabled={busy || saved || uncertain} busy={pendingAction === "note"} onPress={() => act("note", async () => { await context.client.request("notes.upsert", { note: { id: noteId.current, title: text.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").slice(0, 160) || copy("Sohbet notu", "Chat note"), body: text, tags: [], sourceSessionId: context.sessionId, sourceCwd: context.cwd }, expectedUpdatedAt: 0 }); setSaved(true); })} /> : null}
    {reportable ? <NavigationRow label={copy("Bildir", "Report")} disabled={busy} onPress={() => { startContentReport(text); onClose(); router.push("/report"); }} /> : null}
  </NavigationGroup><ErrorText error={error} />{uncertain && context ? <Button label={copy("Notun kaydını kontrol et", "Check saved note")} busy={pendingAction === "check"} onPress={() => act("check", async () => { const note = await context.client.request("notes.get", { id: noteId.current }); if (note) setSaved(true); })} /> : null}</Sheet>;
}
