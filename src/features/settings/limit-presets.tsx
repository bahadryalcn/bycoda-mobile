import { useState } from "react";
import { useCopy } from "@/ui/copy";
import { NumberField, SelectField, Stack } from "@/ui/primitives";

const CUSTOM = "custom";

/** Presets keep the keyboard closed. An explicit custom choice retains the full Host range. */
export function LimitPresets({
  label, customLabel, hint, value, values, format, disabled, onChange,
}: {
  label: string;
  customLabel: string;
  hint?: string;
  value: string;
  values: readonly string[];
  format: (value: string) => string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const copy = useCopy();
  const [editing, setEditing] = useState(false);
  const custom = copy("Özel", "Custom");
  const known = values.includes(value);
  const options = [
    ...values.map((preset) => ({ value: preset, label: format(preset) })),
    { value: CUSTOM, label: custom },
  ];
  return (
    <Stack>
      <SelectField
        label={label}
        hint={hint}
        value={editing ? CUSTOM : known ? value : undefined}
        placeholder={value && !known ? format(value) : undefined}
        options={options}
        searchable={false}
        disabled={disabled}
        onChange={(next) => {
          setEditing(next === CUSTOM);
          if (next !== CUSTOM) onChange(next);
        }}
      />
      {editing ? (
        <NumberField label={customLabel} value={value} editable={!disabled} onChangeText={onChange} />
      ) : null}
    </Stack>
  );
}
