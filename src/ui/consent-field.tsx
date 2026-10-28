import { Checkbox } from "panelui-native/components/checkbox";
import { useMobileTheme } from "./theme";

/** Explicit one-time consent, distinct from a persistent setting switch. */
export function ConsentField({ label, detail, value, onChange, disabled }: {
  label: string;
  detail: string;
  value: boolean;
  onChange(value: boolean): void;
  disabled?: boolean;
}) {
  useMobileTheme();
  return <Checkbox size="lg" className="min-h-12 min-w-12 py-2"
    label={label} description={detail} checked={value} disabled={disabled}
    onCheckedChange={onChange} />;
}
