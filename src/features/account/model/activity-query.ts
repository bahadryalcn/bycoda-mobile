import { localDateFor } from "../contracts";

/** The summary query for "now": the caller's time zone and local date drive week/month/year. */
export function activitySummaryQuery(now: Date, timeZone: string) {
  return { timeZone, date: localDateFor(now, timeZone) };
}

/** Hour/minute split of a minute count; the caller formats it with its own copy. */
export function splitMinutes(minutes: number): { hours: number; minutes: number } {
  const safe = Math.max(0, Math.floor(minutes));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}
