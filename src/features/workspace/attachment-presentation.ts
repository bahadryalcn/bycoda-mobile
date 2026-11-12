import { markdownTarget } from "@/ui/message-inline";

const UNITS = ["B", "KB", "MB", "GB"];

/** "512 B", "1.5 MB", "12 KB": one decimal below 10 units, whole numbers above (desktop format). */
export function formatAttachmentSize(bytes: number, locale?: string): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < UNITS.length - 1) {
    value /= 1024;
    index++;
  }
  const digits = index === 0 ? 0 : value < 10 ? 1 : 0;
  let number: string;
  try {
    number = new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
  } catch {
    number = value.toFixed(digits);
  }
  return `${number} ${UNITS[index]}`;
}

export type ComposerLink = { href: string; host: string; path: string };

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

/** Distinct web links typed or pasted into the draft, in order, for the chips above the field. */
export function composerLinks(text: string, limit = 5): ComposerLink[] {
  const seen = new Set<string>();
  const links: ComposerLink[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0].replace(/[.,;:!?)\]}]+$/, "");
    const target = markdownTarget(raw);
    if (target.kind !== "web" || seen.has(target.href)) continue;
    let url: URL;
    try {
      url = new URL(target.href);
    } catch {
      continue;
    }
    seen.add(target.href);
    const path = `${url.pathname === "/" ? "" : url.pathname}${url.search}`;
    links.push({ href: target.href, host: url.host.replace(/^www\./, ""), path });
    if (links.length >= limit) break;
  }
  return links;
}

/** Thumbnails shown before the "+N" tile; the rest open on tap. */
export const THUMBNAIL_LIMIT = 4;
export function thumbnailSplit<T>(images: readonly T[], expanded: boolean, limit = THUMBNAIL_LIMIT) {
  if (expanded || images.length <= limit) return { shown: images, hidden: 0 };
  return { shown: images.slice(0, limit - 1), hidden: images.length - (limit - 1) };
}
