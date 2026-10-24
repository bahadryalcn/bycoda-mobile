import type { useCopy } from "@/ui/copy";

/** Hermes versions may expose Intl without RelativeTimeFormat. */
export function inboxRelativeTime(
  value: number,
  locale: string,
  copy: ReturnType<typeof useCopy>,
  now = Date.now(),
): string {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(new Date(value).getTime())) return "";
  const seconds = Math.round((value - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  try {
    if (typeof Intl.RelativeTimeFormat === "function") {
      const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
      for (const [unit, size] of units)
        if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
      return format.format(0, "minute");
    }
  } catch {
    // Unsupported locale data must not take down the inbox either.
  }
  if (seconds > 0) return new Date(value).toISOString().slice(0, 10);
  const minutes = Math.round(-seconds / 60);
  if (minutes < 1) return copy("Şimdi", "Now");
  if (minutes < 60) return copy("{p0} dk", "{p0} min", { p0: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return copy("{p0} sa", "{p0} h", { p0: hours });
  return copy("{p0} g", "{p0} d", { p0: Math.floor(hours / 24) });
}
