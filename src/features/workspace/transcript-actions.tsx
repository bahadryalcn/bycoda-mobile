import { useRef, useState } from "react";
import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { Body, Button, ErrorText, NavigationGroup, NavigationRow, Sheet } from "@/ui/primitives";
import { RemoteHostError } from "@/remote/transport";
import type { MessageContext } from "@/ui/media-policy";
import { useCopy } from "@/ui/copy";
import { startContentReport } from "../reporting/report-store";

export function TranscriptActions({ text, responseText, context, reportable, onClose }: { text: string; responseText?: string; context?: MessageContext; reportable: boolean; onClose: () => void }) {
  const copy = useCopy(); const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false);
  const noteId = useRef(randomUUID());
  const uncertain = error instanceof RemoteHostError && error.uncertain;
  const act = (action: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(null); void action().then(() => { setBusy(false); }).catch((cause) => { setBusy(false); setError(cause); }); };
  return <Sheet visible title={copy("Mesaj seçenekleri", "Message options")} size="compact" dismissible={!busy} onClose={onClose}><NavigationGroup>
    <NavigationRow label={copy("Mesajı kopyala", "Copy message")} disabled={busy} onPress={() => act(async () => { await Clipboard.setStringAsync(text); onClose(); })} />
    {responseText && responseText !== text ? <NavigationRow label={copy("Yanıtın tamamını kopyala", "Copy complete response")} disabled={busy} onPress={() => act(async () => { await Clipboard.setStringAsync(responseText); onClose(); })} /> : null}
    <NavigationRow label={copy("Paylaş", "Share")} disabled={busy} onPress={() => act(() => Share.share({ message: text }))} />
    {context ? <NavigationRow label={saved ? copy("Nota kaydedildi", "Saved to notes") : copy("Not olarak kaydet", "Save as note")} disabled={busy || saved || uncertain} onPress={() => act(async () => { await context.client.request("notes.upsert", { note: { id: noteId.current, title: text.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").slice(0, 160) || copy("Sohbet notu", "Chat note"), body: text, tags: [], sourceSessionId: context.sessionId, sourceCwd: context.cwd }, expectedUpdatedAt: 0 }); setSaved(true); })} /> : null}
    {reportable ? <NavigationRow label={copy("Bildir", "Report")} disabled={busy} onPress={() => { startContentReport(text); onClose(); router.push("/report"); }} /> : null}
  </NavigationGroup>{busy ? <Body muted>{copy("İşleniyor…", "Working…")}</Body> : null}<ErrorText error={error} />{uncertain && context ? <Button label={copy("Notun kaydını kontrol et", "Check saved note")} onPress={() => act(async () => { const note = await context.client.request("notes.get", { id: noteId.current }); if (note) setSaved(true); })} /> : null}</Sheet>;
}
