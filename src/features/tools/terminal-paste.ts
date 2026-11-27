import * as Clipboard from "expo-clipboard";
import { confirmAction } from "@/ui/confirm";
import { showToast } from "@/ui/toast";

type Copy = (tr: string, en: string, values?: Record<string, string | number>) => string;

/** Pasted text as a desktop terminal types it: each line break is Enter. Sticky modifiers never apply. */
export function terminalPasteText(text: string): string {
  return text.replace(/\r?\n/g, "\r");
}

/** Lines a paste would run; a trailing line break runs the last line too. */
export function terminalPasteLines(text: string): number {
  return text.split(/\r?\n/).length - (/\r?\n$/.test(text) ? 1 : 0);
}

/**
 * The one paste path of both terminals: an empty or unreadable clipboard says so, and text with a
 * line break asks first because every line runs as a command as soon as it arrives.
 */
export async function pasteIntoTerminal(copy: Copy, send: (text: string) => void): Promise<void> {
  const text = await Clipboard.getStringAsync().catch(() => "");
  if (!text) {
    showToast({ message: copy("Pano boş", "Clipboard is empty") });
    return;
  }
  if (!/[\r\n]/.test(text)) {
    send(text);
    return;
  }
  confirmAction(
    copy("Birden çok satır yapıştırılsın mı?", "Paste multiple lines?"),
    copy("{p0} satır yapıştırılacak; her satır hemen komut olarak çalışır.", "{p0} lines will be pasted; each line runs as a command right away.", { p0: terminalPasteLines(text) }),
    copy("Yapıştır", "Paste"),
    () => send(terminalPasteText(text)),
    copy("Vazgeç", "Cancel"),
    "default",
  );
}
