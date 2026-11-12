import { View } from "react-native";
import { OtpInput } from "panelui-native/components/otp-input";
import { HintLabel } from "./info-hint";
import { FieldError } from "./feedback";
import { sanitizeCode } from "./number-field-model";
import { useMobileTheme } from "./theme";

export type CodeFieldProps = {
  label: string;
  value: string;
  onChangeText: (code: string) => void;
  /** Fires once when the last digit lands; it does not submit by itself. */
  onComplete?: (code: string) => void;
  /** Code length; only for fixed-length numeric codes. */
  length?: number;
  error?: string;
  /** Explanation behind an info icon. */
  hint?: string;
  disabled?: boolean;
};

/**
 * Fixed-length numeric verification code on PanelUI OtpInput. One real TextInput sits
 * underneath, so paste, SMS/e-mail autofill (oneTimeCode) and the number pad still work.
 * Small cells keep six digits inside a 320dp screen.
 */
export function CodeField({ label, value, onChangeText, onComplete, length = 6, error, hint, disabled }: CodeFieldProps) {
  const { uiStyles } = useMobileTheme();
  return (
    <View style={[uiStyles.field, { minWidth: 0, maxWidth: "100%" }]}>
      <HintLabel label={label} help={hint} />
      <OtpInput
        size="sm"
        length={length}
        type="numeric"
        value={value}
        onChangeText={(text) => onChangeText(sanitizeCode(text, length))}
        onComplete={onComplete}
        disabled={disabled}
        isInvalid={Boolean(error)}
        accessibilityLabel={label}
      />
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}
