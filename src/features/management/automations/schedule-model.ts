import type { HostAutomationInput } from "@/domain/types";

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
