import { numberFormat } from "../../../../src/shared/i18n/numberFormat";
const BYTES_PER_GIBIBYTE = 1024 ** 3;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** Memory in GB (binary, matching `memoryLabel`), one decimal place, in the app language. */
export function gibibyteLabel(bytes: number, locale = "en"): string {
  return `${numberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / BYTES_PER_GIBIBYTE)} GB`;
}

/** Share of `whole` that `part` makes up, or null when there is nothing to measure against. */
export function shareOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.min(100, (part / whole) * 100) : null;
}

/** "2 h 36 min" or "42 min"; the unit words come from the caller's copy. */
export function uptimeLabel(seconds: number, units: { hours: string; minutes: string }): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return hours > 0 ? `${hours} ${units.hours} ${rest} ${units.minutes}` : `${rest} ${units.minutes}`;
}

/** Local 24-hour clock time, e.g. "03:22". */
export function clockLabel(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
