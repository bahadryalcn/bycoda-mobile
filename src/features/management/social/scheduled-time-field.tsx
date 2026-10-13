import { useEffect, useState } from "react";
import { Body, ErrorText, Field, ToggleField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { nextPublishTime, parseLocalPublishTime, type ScheduledTimeProps } from "./scheduled-time-types";

export function ScheduledTimeField({ value, onChange, disabled, onValidityChange }: ScheduledTimeProps) {
  const copy = useCopy();
  const [parts, setParts] = useState(() => {
    const date = value ? new Date(value) : nextPublishTime();
    return { date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`, time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` };
  });
  const valid = !value || !!parseLocalPublishTime(parts.date, parts.time);
  useEffect(() => { onValidityChange?.(valid); }, [valid, onValidityChange]);
  function update(patch: Partial<typeof parts>) {
    const next = { ...parts, ...patch };
    setParts(next);
    const parsed = parseLocalPublishTime(next.date, next.time);
    if (parsed) onChange(parsed.toISOString());
  }
  return <>
    <ToggleField label={copy("Yayın zamanı seç", "Choose a publish time")} value={!!value} disabled={disabled} onChange={(enabled) => onChange(enabled ? (parseLocalPublishTime(parts.date, parts.time) ?? nextPublishTime()).toISOString() : "")} />
    {value && <>
      <Field label={copy("Tarih (YYYY-AA-GG)", "Date (YYYY-MM-DD)")} value={parts.date} editable={!disabled} onChangeText={(date) => update({ date })} />
      <Field label={copy("Saat (SS:DD)", "Time (HH:MM)")} value={parts.time} editable={!disabled} onChangeText={(time) => update({ time })} />
      {!valid && <ErrorText error={copy("Geçerli bir tarih ve saat girin.", "Enter a valid date and time.")} />}
      <Body muted>{copy("Telefonun saat dilimi", "Phone time zone")}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Body>
    </>}
    <Body muted>{copy("Yayınlamak için taslağı ayrıca onaylayıp sıraya almalısın.", "Approve and queue the draft separately to publish it.")}</Body>
  </>;
}
