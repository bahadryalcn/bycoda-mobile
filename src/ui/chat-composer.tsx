import { useState, type ComponentProps, type ReactNode } from "react";
import { AIInput } from "panelui-native/components/ai-input";
import { colors, fontSize, metrics, space } from "./tokens";
import { useMobileTheme } from "./theme";

/** The feature owns drafts and dispatch; this facade owns composer presentation. */
export function ChatComposer({
  value,
  onValueChange,
  disabled,
  field,
  leading,
  mode,
  submit,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  field: ComponentProps<typeof AIInput.Field>;
  leading: ReactNode;
  mode?: ReactNode;
  submit: ReactNode;
}) {
  useMobileTheme();
  const [focused, setFocused] = useState(false);
  return (
    <AIInput
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      avoidKeyboard={false}
      maxRows={5}
      size="sm"
      className="w-full shadow-none"
      style={{
        backgroundColor: colors.panel,
        borderColor: focused ? colors.accent : colors.border,
      }}
    >
      <AIInput.Row style={{ flexWrap: "wrap", gap: 0, padding: 0 }}>
      {leading}
      <AIInput.Field
        {...field}
        onFocus={(event) => {
          setFocused(true);
          field.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          field.onBlur?.(event);
        }}
        style={[
          field.style,
          { flex: 1, minWidth: 64, minHeight: metrics.touchTarget, fontSize: fontSize.body, color: colors.text, paddingHorizontal: space.xs },
        ]}
      />
        {mode}
        {submit}
      </AIInput.Row>
    </AIInput>
  );
}
