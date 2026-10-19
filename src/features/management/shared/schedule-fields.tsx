import { Body, ErrorText, Field, SelectField } from "@/ui/primitives";
import { TimeField } from "@/ui/time-field";
import { useCopy } from "@/ui/copy";
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
  return <>
    <SelectField label={copy("Zamanlama", "Schedule")} value={value.scheduleKind} disabled={disabled}
      options={[
        { value: "hourly", label: copy("Saatlik", "Hourly") },
        { value: "daily", label: copy("Günlük", "Daily") },
        { value: "weekdays", label: copy("Hafta içi", "Weekdays") },
        { value: "weekly", label: copy("Haftalık", "Weekly") },
      ]} onChange={(scheduleKind) => onChange({ scheduleKind })} />
    {value.scheduleKind === "hourly" ? <>
      <Field editable={!disabled} label={copy("Her saatin dakikası (0–59)", "Minute of each hour (0–59)")}
        value={minute} keyboardType="number-pad" onChangeText={onMinuteChange} />
      {!integerInRange(minute, 0, 59) ? <ErrorText error={copy("0 ile 59 arasında bir dakika girin.", "Enter a minute from 0 to 59.")} /> : null}
    </> : <>
      <TimeField disabled={disabled} label={copy("Saat (SS:DD)", "Time (HH:MM)")} value={value.time}
        onChange={(time) => onChange({ time })} />
      {!validScheduleTime(value.time) ? <ErrorText error={copy("Saati SS:DD biçiminde girin (00:00–23:59).", "Use HH:MM time (00:00–23:59).")} /> : null}
    </>}
    {value.scheduleKind === "weekly" ? <SelectField label={copy("Gün", "Day")} value={String(value.dayOfWeek)} disabled={disabled}
      options={[
        { value: "0", label: copy("Pazar", "Sunday") },
        { value: "1", label: copy("Pazartesi", "Monday") },
        { value: "2", label: copy("Salı", "Tuesday") },
        { value: "3", label: copy("Çarşamba", "Wednesday") },
        { value: "4", label: copy("Perşembe", "Thursday") },
        { value: "5", label: copy("Cuma", "Friday") },
        { value: "6", label: copy("Cumartesi", "Saturday") },
      ]} onChange={(day) => onChange({ dayOfWeek: Number(day) })} /> : null}
    <Body muted>{copy("Bilgisayarın yerel saati kullanılır; sonraki çalışma telefondaki saatle gösterilir.", "Schedules use computer local time; the next run is shown in phone time.")}</Body>
  </>;
}
