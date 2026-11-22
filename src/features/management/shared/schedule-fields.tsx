import { Body, ErrorText, SelectField } from "@/ui/primitives";
import { IntegerTextStepper } from "@/ui/limit-presets";
import { TimeField } from "@/ui/time-field";
import { useCopy } from "@/ui/copy";
import { HoursOverview } from "@/ui/week-hours";
import { WEEK_ORDER, weekRunBlocks } from "@/ui/week-hours-model";
import { integerInRange, validScheduleTime } from "../automations/schedule-model";
import type { HostAutomationInput } from "@/domain/types";

type Schedule = Pick<HostAutomationInput, "scheduleKind" | "time" | "dayOfWeek">;

/** The same host-local schedule controls are shared by automations and stewards. */
export function ScheduleFields({ value, minute, onMinuteChange, onChange, disabled }: {
  value: Schedule;
  minute: string;
  onMinuteChange(value: string): void;
  onChange(value: Partial<Schedule>): void;
  disabled?: boolean;
}) {
  const copy = useCopy();
  const dayNames = [copy("Paz", "Sun"), copy("Pzt", "Mon"), copy("Sal", "Tue"), copy("Çar", "Wed"), copy("Per", "Thu"), copy("Cum", "Fri"), copy("Cmt", "Sat")];
  const runs = weekRunBlocks({ ...value, minute: Number(minute) });
  return <>
    <SelectField label={copy("Sıklık", "Frequency")} value={value.scheduleKind} disabled={disabled}
      hint={copy("Bilgisayarın yerel saati kullanılır; sonraki çalışma telefondaki saatle gösterilir.", "Schedules use computer local time; the next run is shown in phone time.")}
      options={[
        { value: "hourly", label: copy("Saatlik", "Hourly") },
        { value: "daily", label: copy("Günlük", "Daily") },
        { value: "weekdays", label: copy("Hafta içi", "Weekdays") },
        { value: "weekly", label: copy("Haftalık", "Weekly") },
      ]} onChange={(scheduleKind) => onChange({ scheduleKind })} />
    {value.scheduleKind === "hourly" ? <>
      <IntegerTextStepper disabled={disabled} label={copy("Her saatin dakikası", "Minute of each hour")}
        min={0} max={59} value={minute} onChangeText={onMinuteChange}
        error={!integerInRange(minute, 0, 59) ? copy("0 ile 59 arasında bir dakika girin.", "Enter a minute from 0 to 59.") : undefined} />
    </> : <>
      <TimeField disabled={disabled} label={copy("Saat (SS:DD)", "Time (HH:MM)")} value={value.time}
        onChange={(time) => onChange({ time })} />
      {!validScheduleTime(value.time) ? <ErrorText error={copy("Saati SS:DD biçiminde girin (00:00–23:59).", "Use HH:MM time (00:00–23:59).")} /> : null}
    </>}
    {value.scheduleKind === "weekly" ? <SelectField label={copy("Gün", "Day")} value={String(value.dayOfWeek)} disabled={disabled} searchable={false}
      options={[
        { value: "0", label: copy("Pazar", "Sunday") },
        { value: "1", label: copy("Pazartesi", "Monday") },
        { value: "2", label: copy("Salı", "Tuesday") },
        { value: "3", label: copy("Çarşamba", "Wednesday") },
        { value: "4", label: copy("Perşembe", "Thursday") },
        { value: "5", label: copy("Cuma", "Friday") },
        { value: "6", label: copy("Cumartesi", "Saturday") },
      ]} onChange={(day) => onChange({ dayOfWeek: Number(day) })} /> : null}
    <HoursOverview rows={WEEK_ORDER.map((day) => ({ key: String(day), label: dayNames[day], blocks: runs[day] }))} />
  </>;
}
