import { useState } from "react";
import { Field } from "./fields";
import { useCopy } from "./copy";
import { Button } from "./buttons";
import { TimeFieldTrigger } from "./time-field-trigger";
import { Sheet } from "./dialogs";
import { Row } from "./layout";
import { ErrorText } from "./feedback";
import { parseWallTime, type TimeFieldProps } from "./time-field-model";

/** Browser fallback: one wall-time field with explicit cancel/apply. */
export function TimeField({ label, value, onChange, disabled }: TimeFieldProps) {
  const copy = useCopy();
  const [draft, setDraft] = useState<string | null>(null);
  if (disabled && draft !== null) setDraft(null);
  const valid = draft !== null && parseWallTime(draft) !== undefined;
  return <>
    <TimeFieldTrigger label={label} value={value} disabled={disabled}
      onPress={() => setDraft(parseWallTime(value) ? value : "09:00")} />
    {draft !== null && !disabled ? <Sheet visible title={label} size="compact" onClose={() => setDraft(null)}
      footer={<Row style={{ justifyContent: "space-between" }}>
        <Button label={copy("Vazgeç", "Cancel")} tone="quiet" onPress={() => setDraft(null)} />
        <Button label={copy("Uygula", "Apply")} tone="primary" disabled={!valid} onPress={() => {
          if (!valid) return;
          onChange(draft);
          setDraft(null);
        }} />
      </Row>}>
      <Field label={label} value={draft} onChangeText={setDraft} autoFocus
        placeholder="09:00" keyboardType="numbers-and-punctuation" autoCorrect={false} />
      {!valid ? <ErrorText error={copy("Saati SS:DD biçiminde girin (00:00–23:59).", "Use HH:MM time (00:00–23:59).")} /> : null}
    </Sheet> : null}
  </>;
}
