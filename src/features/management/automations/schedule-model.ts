import type { HostAutomationInput } from "@/domain/types";
import type { AutomationSchedulePreview } from "@/remote/types";

export function validSchedulePreview(value: unknown): value is AutomationSchedulePreview {
  if (!value || typeof value !== "object") return false;
  const { nextRunAt, timeZone } = value as Record<string, unknown>;
  return typeof nextRunAt === "number" && Number.isFinite(nextRunAt) && nextRunAt > 0 &&
    Number.isFinite(new Date(nextRunAt).getTime()) &&
    typeof timeZone === "string" && timeZone.length > 0 && timeZone.length <= 100 &&
    !/[\u0000-\u001f\u007f]/.test(timeZone);
}

export function integerInRange(value: string, min: number, max: number) {
  return /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
}

export function validScheduleTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function scheduleLabel(
  item: Pick<HostAutomationInput, "scheduleKind" | "time" | "minute" | "dayOfWeek">,
  copy: (tr: string, en: string) => string,
) {
  const days = [copy("Pazar", "Sunday"), copy("Pazartesi", "Monday"), copy("Salı", "Tuesday"), copy("Çarşamba", "Wednesday"), copy("Perşembe", "Thursday"), copy("Cuma", "Friday"), copy("Cumartesi", "Saturday")];
  switch (item.scheduleKind) {
    case "hourly": return `${copy("Saatlik", "Hourly")} · :${String(item.minute).padStart(2, "0")}`;
    case "daily": return `${copy("Günlük", "Daily")} · ${item.time}`;
    case "weekdays": return `${copy("Hafta içi", "Weekdays")} · ${item.time}`;
    case "weekly": return `${days[item.dayOfWeek] ?? copy("Haftalık", "Weekly")} · ${item.time}`;
    default: return item.scheduleKind;
  }
}

/** The schedule as a human sentence ("Every weekday at 09:00"); stewards share it. */
export function scheduleSentence(
  item: Pick<HostAutomationInput, "scheduleKind" | "time" | "minute" | "dayOfWeek">,
  copy: (tr: string, en: string, values?: Record<string, string | number>) => string,
) {
  const days = [copy("Pazar", "Sunday"), copy("Pazartesi", "Monday"), copy("Salı", "Tuesday"), copy("Çarşamba", "Wednesday"), copy("Perşembe", "Thursday"), copy("Cuma", "Friday"), copy("Cumartesi", "Saturday")];
  const time = { p0: item.time };
  switch (item.scheduleKind) {
    case "hourly": return copy("Her saat {p0}. dakikada", "Every hour at minute {p0}", { p0: item.minute });
    case "daily": return copy("Her gün {p0}", "Every day at {p0}", time);
    case "weekdays": return copy("Hafta içi her gün {p0}", "Every weekday at {p0}", time);
    case "weekly": return copy("Her {p0} {p1}", "Every {p0} at {p1}", { p0: days[item.dayOfWeek] ?? copy("hafta", "week"), p1: item.time });
    default: return item.scheduleKind;
  }
}
