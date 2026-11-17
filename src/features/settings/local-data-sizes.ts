import { isUserDraftKey } from "@/state/local-draft-storage";

type SizeStorage = {
  getAllKeys(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
};

export type LocalDataSizes = { media: number; attachments: number; drafts: number };

/** Compact byte count: 0 B, 12 KB, 3.4 MB. Decimal units, one decimal below 10. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
  const text = unit === 0 || value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
  return `${text} ${units[unit]}`;
}

/** Characters stored for saved message, file and note drafts; other app settings are never counted. */
export async function savedDraftBytes(storage: SizeStorage): Promise<number> {
  let total = 0;
  for (const key of (await storage.getAllKeys()).filter(isUserDraftKey)) {
    // shortcut: string length approximates bytes for non-ASCII text, which only affects the displayed size.
    total += key.length + ((await storage.getItem(key))?.length ?? 0);
  }
  return total;
}
