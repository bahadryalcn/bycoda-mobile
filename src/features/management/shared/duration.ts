type Copy = (tr: string, en: string, values?: Record<string, string | number>) => string;

/** A compact elapsed time such as "45 s", "14 min", "2 h 5 min" or "3 d"; empty for an unknown span. */
export function formatDuration(ms: number | undefined, copy: Copy): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return copy("{p0} sn", "{p0} s", { p0: Math.max(1, Math.round(ms / 1000)) });
  if (minutes < 60) return copy("{p0} dk", "{p0} min", { p0: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest
      ? copy("{p0} sa {p1} dk", "{p0} h {p1} min", { p0: hours, p1: rest })
      : copy("{p0} sa", "{p0} h", { p0: hours });
  }
  return copy("{p0} g", "{p0} d", { p0: Math.floor(hours / 24) });
}
