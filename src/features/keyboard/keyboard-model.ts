import { normalizeSearch } from "@/ui/search-matching";

export type PaletteEntry = {
  id: string;
  label: string;
  detail?: string;
  kind: "session" | "project" | "tool" | "setting" | "action";
  destination: { pathname: string; params?: Record<string, string> };
};
export const TAB_ROUTES = ["/(tabs)", "/(tabs)/chats", "/(tabs)/inbox", "/(tabs)/manage", "/(tabs)/settings"] as const;

/** Every search word must match; exact and prefix title matches rank first. */
export function searchPalette(entries: readonly PaletteEntry[], query: string, locale?: string): PaletteEntry[] {
  const normalized = normalizeSearch(query, locale);
  const words = normalized.split(" ").filter(Boolean);
  return entries.map((entry, index) => {
    const label = normalizeSearch(entry.label, locale);
    const haystack = normalizeSearch(`${entry.label} ${entry.detail ?? ""}`, locale);
    const score = label === normalized ? 0 : label.startsWith(normalized) ? 1 : 2;
    return { entry, index, score, matches: words.every((word) => haystack.includes(word)) };
  }).filter((row) => row.matches).sort((a, b) => a.score - b.score || a.index - b.index).map(({ entry }) => entry);
}

export function movePaletteSelection(index: number, count: number, direction: -1 | 1): number {
  if (!count) return -1;
  if (index < 0 || index >= count) return direction === 1 ? 0 : count - 1;
  return (index + direction + count) % count;
}

export type ShortcutId = "palette" | "search" | "new" | "back" | "tabs" | "settings" | "shortcuts" | "close";
export const SHORTCUTS: readonly { id: ShortcutId; keys: string }[] = [
  { id: "palette", keys: "⌘K" },
  { id: "search", keys: "⌘F" },
  { id: "new", keys: "⌘N" },
  { id: "back", keys: "⌘[" },
  { id: "tabs", keys: "⌘1–5" },
  { id: "settings", keys: "⌘," },
  { id: "shortcuts", keys: "⌘/" },
  { id: "close", keys: "Esc" },
];
