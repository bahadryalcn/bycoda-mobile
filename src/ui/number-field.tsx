import { View } from "react-native";
import { HintLabel, UnitHint, isUnitHint } from "./info-hint";
import { FieldError } from "./feedback";
import { Input } from "./fields";
import { sanitizeNumberText } from "./number-field-model";
import { useMobileTheme } from "./theme";
import { space } from "./tokens";
import type { InputProps } from "./component-props";

export type NumberFieldProps = Omit<InputProps, "value" | "onChangeText" | "keyboardType"> & {
  /** Text value; the owner parses and range-validates it, so an empty field stays representable. */
  value: string;
  onChangeText: (text: string) => void;
  /** Trailing unit such as "min", drawn inside the field by PanelUI InputGroup. */
  unit?: string;
  /** Allow one decimal separator. */
  decimal?: boolean;
};

/**
 * Numeric text field: label, digits-only entry, optional inline unit, error/hint.
 * Updates on every keystroke, unlike PanelUI NumberInput, which commits on blur and
 * would let Save read a stale value while the keyboard is still open.
 */
export function NumberField({ label, hint, error, unit, decimal, onChangeText, ...props }: NumberFieldProps) {
  const { uiStyles } = useMobileTheme();
  return (
    <View style={[uiStyles.field, (error || isUnitHint(hint)) && { paddingBottom: space.xs }]}>
      <HintLabel label={label} help={hint} />
      <Input
        {...props}
        label={label}
        error={error}
        hint={hint}
        suffix={unit}
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
        inputMode={decimal ? "decimal" : "numeric"}
        onChangeText={(text) => onChangeText(sanitizeNumberText(text, decimal))}
      />
      {error ? <FieldError message={error} /> : <UnitHint hint={hint} />}
    </View>
  );
}
