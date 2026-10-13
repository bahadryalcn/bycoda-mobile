import { useEffect, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Body, Button, Row, ToggleField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { nextPublishTime, type ScheduledTimeProps } from "./scheduled-time-types";

export function ScheduledTimeField({ value, onChange, disabled, onValidityChange }: ScheduledTimeProps) {
  const copy = useCopy();
  const locale = useLocale();
  const [mode, setMode] = useState<"date" | "time" | null>(null);
  const parsed = value ? new Date(value) : nextPublishTime();
  const date = Number.isFinite(parsed.getTime()) ? parsed : nextPublishTime();
  useEffect(() => { onValidityChange?.(true); }, [onValidityChange]);
  return <>
    <ToggleField label={copy("Yayın zamanı seç", "Choose a publish time")} value={!!value} disabled={disabled} onChange={(enabled) => { setMode(null); onChange(enabled ? nextPublishTime().toISOString() : ""); }} />
    {value && <>
      <Row>
        <Button label={date.toLocaleDateString(locale, { dateStyle: "medium" })} disabled={disabled} onPress={() => setMode("date")} />
        <Button label={date.toLocaleTimeString(locale, { timeStyle: "short" })} disabled={disabled} onPress={() => setMode("time")} />
      </Row>
      {mode && <DateTimePicker value={date} mode={mode} locale={locale} is24Hour={true} positiveButton={{ label: copy("Tamam", "OK") }} negativeButton={{ label: copy("Vazgeç", "Cancel") }} display={process.env.EXPO_OS === "ios" ? "spinner" : "default"} onValueChange={(_event, selected) => { if (process.env.EXPO_OS !== "ios") setMode(null); onChange(selected.toISOString()); }} onDismiss={() => setMode(null)} />}
      {mode && process.env.EXPO_OS === "ios" && <Button tone="quiet" label={copy("Bitti", "Done")} onPress={() => setMode(null)} />}
      <Body muted>{copy("Telefonun saat dilimi", "Phone time zone")}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</Body>
    </>}
    <Body muted>{copy("Yayınlamak için taslağı ayrıca onaylayıp sıraya almalısın.", "Approve and queue the draft separately to publish it.")}</Body>
  </>;
}
