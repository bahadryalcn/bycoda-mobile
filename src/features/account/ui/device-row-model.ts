import type { Device } from "../contracts";

type Copy = (tr: string, en: string, values?: Record<string, string | number>) => string;

const PLATFORM_NAMES: Record<Device["platform"], string> = {
  windows: "Windows", macos: "macOS", linux: "Linux", ios: "iOS", android: "Android", web: "Web",
};

/** "3 days ago" in the app's language; days at most, since device use is coarse. */
function lastSeen(value: number, locale: string, copy: Copy, now: number): string {
  if (!Number.isFinite(value)) return "";
  const minutes = Math.max(0, Math.round((now - value) / 60_000));
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] = minutes < 60 ? [minutes, "minute"]
    : minutes < 1440 ? [Math.floor(minutes / 60), "hour"] : [Math.floor(minutes / 1440), "day"];
  try {
    // Hermes versions may expose Intl without RelativeTimeFormat.
    if (typeof Intl.RelativeTimeFormat === "function")
      return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-amount, unit);
  } catch {
    // Missing locale data falls back to the short form below.
  }
  if (unit === "minute") return amount < 1 ? copy("şimdi", "now") : copy("{p0} dk önce", "{p0} min ago", { p0: amount });
  return unit === "hour" ? copy("{p0} sa önce", "{p0} h ago", { p0: amount }) : copy("{p0} gün önce", "{p0} days ago", { p0: amount });
}

/**
 * The row's second line: system, app version and when the device was last seen, so an unused
 * device stands out when the account reaches its device limit. Empty parts are skipped.
 */
export function deviceDetail(item: Pick<Device, "platform" | "osVersion" | "appVersion" | "lastSeenAt">, locale: string, copy: Copy, now = Date.now()): string {
  const platform = PLATFORM_NAMES[item.platform];
  const os = item.osVersion.trim();
  // Phones report "iOS 19.1"; desktops report the bare version.
  const system = !os ? platform : os.toLowerCase().startsWith(platform.toLowerCase()) ? os : `${platform} ${os}`;
  const app = item.appVersion.trim() ? `bycoda ${item.appVersion.trim()}` : "";
  const seen = lastSeen(Date.parse(item.lastSeenAt), locale, copy, now);
  return [system, app, seen ? copy("Son görülme: {p0}", "Last seen: {p0}", { p0: seen }) : ""].filter(Boolean).join(" · ");
}

/** The leading glyph comes from the device's reported kind and platform, never from its editable name. */
export function deviceGlyphKind(item: Pick<Device, "kind" | "platform">): "phone" | "web" | "computer" {
  if (item.kind === "mobile") return "phone";
  return item.platform === "web" ? "web" : "computer";
}
