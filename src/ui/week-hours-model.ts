/** One filled stretch of a day, in hours (9.5 is half past nine). */
export type HourBlock = { start: number; end: number };

/** "HH:MM" wall time as hours, or undefined when it is not a valid 00:00-23:59 time. */
export function wallTimeHours(value: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) + Number(match[2]) / 60 : undefined;
}

/**
 * A daily window as blocks inside one 0-24 day. An overnight window (22:00-07:00)
 * becomes its evening and morning parts. Equal or invalid times give no blocks.
 * Wall-clock only: no time zone conversion happens here.
 */
export function windowBlocks(start: string, end: string): HourBlock[] {
  const from = wallTimeHours(start);
  const to = wallTimeHours(end);
  if (from === undefined || to === undefined || from === to) return [];
  if (from < to) return [{ start: from, end: to }];
  return to > 0 ? [{ start: from, end: 24 }, { start: 0, end: to }] : [{ start: from, end: 24 }];
}

/** Width of the marker drawn for a run that has a start but no known length. */
export const RUN_MARKER_HOURS = 0.5;

export type WeekRunSchedule = { scheduleKind: string; time: string; minute: number; dayOfWeek: number };

/** Sunday=0 ... Saturday=6, shown Monday first. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Run markers per day (index 0 = Sunday) for a stored automation schedule; invalid input gives empty days. */
export function weekRunBlocks(schedule: WeekRunSchedule): HourBlock[][] {
  const days: HourBlock[][] = [[], [], [], [], [], [], []];
  const marker = (hours: number): HourBlock => ({ start: hours, end: Math.min(24, hours + RUN_MARKER_HOURS) });
  if (schedule.scheduleKind === "hourly") {
    if (!Number.isInteger(schedule.minute) || schedule.minute < 0 || schedule.minute > 59) return days;
    for (let day = 0; day < 7; day++)
      for (let hour = 0; hour < 24; hour++) days[day].push(marker(hour + schedule.minute / 60));
    return days;
  }
  const at = wallTimeHours(schedule.time);
  if (at === undefined) return days;
  const active =
    schedule.scheduleKind === "daily" ? [0, 1, 2, 3, 4, 5, 6]
    : schedule.scheduleKind === "weekdays" ? [1, 2, 3, 4, 5]
    : schedule.scheduleKind === "weekly" && schedule.dayOfWeek >= 0 && schedule.dayOfWeek <= 6 ? [schedule.dayOfWeek]
    : [];
  for (const day of active) days[day].push(marker(at));
  return days;
}
