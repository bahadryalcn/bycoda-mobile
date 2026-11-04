import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { AIInput } from "panelui-native/components/ai-input";
import { colors, fontSize, interfaceFont, metrics, space } from "./tokens";
import { useMobileTheme } from "./theme";
import { ComposerActionArea } from "./composer-actions";

/** The feature owns drafts and dispatch; this facade owns composer presentation. */
export function ChatComposer({
  value,
  onValueChange,
  disabled,
  field,
  leading,
  mode,
  submit,
  onToolbarLayout,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  field: ComponentProps<typeof AIInput.Field>;
  leading: ReactNode;
  mode?: ReactNode;
  submit: ReactNode;
  onToolbarLayout?: (event: LayoutChangeEvent) => void;
}) {
  useMobileTheme();
  const requested = StyleSheet.flatten(field.style)?.minHeight;
  const minimum = typeof requested === "number" && Number.isFinite(requested) ? Math.max(metrics.touchTarget, requested) : metrics.touchTarget;
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
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <AIInput.Field
        {...field}
        style={[
          field.style,
          { minWidth: 0, minHeight: minimum, fontSize: fontSize.body, fontFamily: interfaceFont, color: colors.text, paddingHorizontal: space.md },
          process.env.EXPO_OS === "web" && ({ resize: "none" } as object),
        ]}
      />
      <AIInput.Row onLayout={onToolbarLayout} style={{ flexWrap: "wrap", gap: 0, padding: 0 }}>
        {leading}
        {mode}
        <View style={{ flex: 1 }} />
        <ComposerActionArea />
        {submit}
      </AIInput.Row>
    </AIInput>
  );
}
