import type { ComponentProps, ReactNode } from "react";
import { View } from "react-native";
import { AIInput } from "panelui-native/components/ai-input";
import { colors, fontSize, interfaceFont, metrics, space } from "./tokens";
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
        backgroundColor: colors.fill,
        borderWidth: 0,
        borderColor: colors.border,
      }}
    >
      <AIInput.Field
        {...field}
        style={[
          field.style,
          { minWidth: 0, minHeight: metrics.touchTarget, fontSize: fontSize.body, fontFamily: interfaceFont, color: colors.text, paddingHorizontal: space.md },
          process.env.EXPO_OS === "web" && ({ resize: "none" } as object),
        ]}
      />
      <AIInput.Row style={{ flexWrap: "wrap", gap: 0, padding: 0 }}>
        {leading}
        {mode}
        <View style={{ flex: 1 }} />
        {submit}
      </AIInput.Row>
    </AIInput>
  );
}
