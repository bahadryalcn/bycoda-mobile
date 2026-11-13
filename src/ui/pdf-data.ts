import { File as NativeFile } from "expo-file-system";
import { MAX_MEDIA_BYTES } from "./media-policy";

export function checkedPdfBase64(value: string): string {
  if (!value || value.length > Math.ceil(MAX_MEDIA_BYTES / 3) * 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new Error("Invalid or oversized PDF data.");
  const bytes = value.length / 4 * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
  if (bytes > MAX_MEDIA_BYTES) throw new Error("PDF exceeds the preview limit.");
  return value;
}

/** The reader consumes an already-downloaded local file, never a remote PDF service. */
export async function readPdfData(uri: string, signal?: AbortSignal): Promise<string> {
  const check = () => { if (signal?.aborted) throw new Error("PDF preview cancelled."); };
  check();
  if (uri.startsWith("data:application/pdf;base64,")) return checkedPdfBase64(uri.slice("data:application/pdf;base64,".length));
  if (process.env.EXPO_OS === "web") {
    if (!uri.startsWith("blob:")) throw new Error("PDF preview requires a downloaded file.");
    const response = await fetch(uri, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("PDF file is unavailable.");
    const blob = await response.blob();
    if (blob.size > MAX_MEDIA_BYTES) throw new Error("PDF exceeds the preview limit.");
    const value = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("PDF file could not be read."));
      reader.onabort = () => reject(new Error("PDF preview cancelled."));
      reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
      reader.readAsDataURL(blob);
    });
    check(); return checkedPdfBase64(value);
  }
  if (!/^(?:file|content):\/\//i.test(uri)) throw new Error("PDF preview requires a downloaded file.");
  const file = new NativeFile(uri);
  if (!file.exists || file.size > MAX_MEDIA_BYTES) throw new Error("PDF is unavailable or exceeds the preview limit.");
  const value = await file.base64();
  check(); return checkedPdfBase64(value);
}

export type PdfPosition = { page: number; zoom: number };
export function pdfPositionMessage(raw: unknown, channel: string): PdfPosition | undefined {
  if (typeof raw !== "string" || raw.length > 256) return;
  try {
    const message: unknown = JSON.parse(raw);
    if (!message || typeof message !== "object") return;
    const value = message as Record<string, unknown>;
    if (value.kind !== "pdf-position" || value.channel !== channel || typeof value.page !== "number" ||
      !Number.isSafeInteger(value.page) || value.page < 1 || value.page > 1_000_000 ||
      typeof value.zoom !== "number" || !Number.isFinite(value.zoom) || value.zoom < 0.25 || value.zoom > 3) return;
    return { page: value.page, zoom: value.zoom };
  } catch { return; }
}
