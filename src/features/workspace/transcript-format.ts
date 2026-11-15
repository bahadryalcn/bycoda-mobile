import { formatDuration } from "@/features/management/shared/duration";
import type { Block } from "./wire";

type Copy = (tr: string, en: string, values?: Record<string, string | number>) => string;
type TurnMetrics = NonNullable<Block["turnMetrics"]>;

const startOfDay = (value: number) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Desktop's "auto" timestamp: a clock today, "Yesterday 09:30", else a short date with the clock. */
export function formatMessageTime(value: number, locale: string, copy: Copy, now = Date.now()): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  const day = startOfDay(value);
  const today = startOfDay(now);
  if (day === today) return time;
  if (day === startOfDay(today - 1)) return copy("Dün {p0}", "Yesterday {p0}", { p0: time });
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Desktop's settled fold label: "{model} worked for {elapsed}". */
export function turnDurationLabel(durationMs: number | undefined, modelName: string | undefined, copy: Copy) {
  const who = modelName?.trim();
  const elapsed = formatDuration(durationMs, copy);
  if (!elapsed) return who ? copy("{p0} çalıştı", "{p0} worked", { p0: who }) : copy("Çalıştı", "Worked");
  return who
    ? copy("{p0} {p1} boyunca çalıştı", "{p0} worked for {p1}", { p0: who, p1: elapsed })
    : copy("{p0} boyunca çalıştı", "Worked for {p0}", { p0: elapsed });
}

export function hasTurnMetrics(metrics: TurnMetrics | undefined): metrics is TurnMetrics {
  return (
    !!metrics &&
    [metrics.inputTokens, metrics.outputTokens, metrics.cacheReadTokens, metrics.cacheHitPercent].some(
      (value) => value != null,
    )
  );
}

/** Desktop's turn metrics: a headline (cache hit, output speed) and the token detail line. */
export function turnMetricsLines(
  metrics: TurnMetrics,
  durationMs: number | undefined,
  locale: string,
  copy: Copy,
): { headline: string; detail: string } {
  const count = (value: number) =>
    new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
  const rate =
    metrics.outputTokens != null && durationMs != null && durationMs > 0
      ? metrics.outputTokens / (durationMs / 1000)
      : undefined;
  const headline =
    [
      metrics.cacheHitPercent != null
        ? copy("Önbellek isabeti %{p0}", "Cache hit {p0}%", { p0: Math.round(metrics.cacheHitPercent) })
        : "",
      rate != null ? copy("Çıktı {p0} tok/sn", "Output {p0} tok/s", { p0: count(rate) }) : "",
    ]
      .filter(Boolean)
      .join(" · ") || copy("Tur token'ları", "Turn tokens");
  const detail = [
    metrics.inputTokens != null ? copy("{p0} girdi", "{p0} input", { p0: count(metrics.inputTokens) }) : "",
    metrics.outputTokens != null ? copy("{p0} çıktı", "{p0} output", { p0: count(metrics.outputTokens) }) : "",
    metrics.cacheReadTokens != null
      ? copy("{p0} önbellekten", "{p0} cached", { p0: count(metrics.cacheReadTokens) })
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { headline, detail };
}
