import { useState } from "react";
import { useLocale } from "@/i18n";
import { useCopy } from "@/ui/copy";
import { IntegerStepper, stepperValue, type IntegerStepperProps } from "@/ui/integer-stepper";
import { ErrorText, NumberField, SelectField, Stack } from "@/ui/primitives";

const CUSTOM = "custom";
const MINUTE_PRESETS = ["0", "15", "30", "60", "120", "240", "480", "1440"] as const;

/** Binds a stepper to a text draft; a restored value outside the range keeps its error until changed. */
export function IntegerTextStepper({ value, onChangeText, error, ...props }: Omit<IntegerStepperProps, "value" | "onValueChange"> & {
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
}) {
  return (
    <Stack>
      <IntegerStepper {...props} value={stepperValue(value, props.min, props.max)} onValueChange={(next) => onChangeText(String(next))} />
      {error ? <ErrorText error={error} /> : null}
    </Stack>
  );
}

/** Presets keep the keyboard closed. An explicit custom choice retains the full Host range. */
export function LimitPresets({
  label, customLabel, hint, unit, error, invalid, value, values, format, disabled, onChange,
}: {
  label: string;
  customLabel: string;
  hint?: string;
  unit?: string;
  /** An invalid draft opens the custom field so the value and its error stay visible. */
  error?: string;
  /** The draft is invalid and its owner already shows the message. */
  invalid?: boolean;
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
  const unreadable = invalid || !!error;
  const showCustom = editing || unreadable;
  const options = [
    ...values.map((preset) => ({ value: preset, label: format(preset) })),
    { value: CUSTOM, label: custom },
  ];
  return (
    <Stack>
      <SelectField
        label={label}
        hint={hint}
        value={showCustom ? CUSTOM : known ? value : undefined}
        placeholder={value && !known && !unreadable ? format(value) : undefined}
        options={options}
        searchable={false}
        disabled={disabled}
        onChange={(next) => {
          setEditing(next === CUSTOM);
          if (next !== CUSTOM) onChange(next);
        }}
      />
      {showCustom ? (
        <NumberField label={customLabel} unit={unit} error={error} value={value} editable={!disabled} onChangeText={onChange} />
      ) : null}
    </Stack>
  );
}

/** A duration limit in minutes. Zero means unlimited unless `min` excludes it. */
export function MinuteLimitField({ label, value, min = 0, hint, error, invalid, disabled, onChange }: {
  label: string;
  value: string;
  min?: number;
  hint?: string;
  error?: string;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  return (
    <LimitPresets
      label={label}
      customLabel={copy("Özel", "Custom")}
      unit={copy("dk", "min")}
      hint={hint}
      error={error}
      invalid={invalid}
      value={value}
      values={MINUTE_PRESETS.filter((preset) => Number(preset) >= min)}
      format={(minutes) => minutes === "0"
        ? copy("Sınırsız", "Unlimited")
        : copy("{p0} dk", "{p0} min", { p0: new Intl.NumberFormat(locale).format(Number(minutes)) })}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
