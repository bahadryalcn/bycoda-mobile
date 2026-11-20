import type { ReactNode } from "react";
import { View, useWindowDimensions, type LayoutChangeEvent, type TextInputProps } from "react-native";
import { AIInput } from "panelui-native/components/ai-input";
import { fontSize, interfaceFont, lineHeight, metrics, radii, space } from "./tokens";
import { useMobileTheme } from "./theme";
import { ComposerActionArea } from "./composer-actions";
import { COMPOSER_FIELD_PADDING, COMPOSER_MAX_LINES } from "./chat-composer-model";

/** Compact toolbar row: 32dp controls plus hit slop keep the capsule at two short rows. */
const TOOLBAR_HEIGHT = metrics.visualControl + space.xs * 2;

/**
 * The feature owns drafts and dispatch; this facade owns composer presentation: one capsule with a
 * full-width field that starts at one line (48dp) and grows to five before scrolling, then a
 * toolbar row of attach, chips, queue actions and send/stop.
 */
export function ChatComposer({
  value,
  onValueChange,
  disabled,
  field,
  top,
  leading,
  mode,
  model,
  submit,
  onToolbarLayout,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  field: Omit<TextInputProps, "value" | "onChangeText" | "editable" | "multiline">;
  /** Notes and attachments live inside the capsule, above the field. */
  top?: ReactNode;
  leading: ReactNode;
  mode?: ReactNode;
  model?: ReactNode;
  submit: ReactNode;
  onToolbarLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { colors } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const { style, ...rest } = field;
  return (
    <AIInput
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      avoidKeyboard={false}
      maxRows={COMPOSER_MAX_LINES}
      size="sm"
      className="w-full shadow-none"
      style={{
        backgroundColor: colors.raised,
        borderRadius: radii.composer,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        opacity: 1,
      }}
    >
      {top}
      <AIInput.Field
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        {...rest}
        style={[
          {
            minWidth: 0,
            minHeight: metrics.composerFieldMin,
            maxHeight: Math.ceil(lineHeight.input * scale * COMPOSER_MAX_LINES + COMPOSER_FIELD_PADDING * 2),
            paddingTop: COMPOSER_FIELD_PADDING,
            paddingBottom: COMPOSER_FIELD_PADDING,
            paddingHorizontal: space.lg,
            fontSize: fontSize.input,
            lineHeight: lineHeight.input,
            fontFamily: interfaceFont,
            color: colors.text,
            includeFontPadding: false,
            textAlignVertical: "top",
          },
          style,
        ]}
      />
      <AIInput.Toolbar
        onLayout={onToolbarLayout}
        style={{
          minHeight: TOOLBAR_HEIGHT,
          gap: space.xs,
          paddingHorizontal: space.sm,
          paddingBottom: space.xs,
        }}
      >
        {leading}
        {mode ? <View style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: space.xs }}>{mode}</View> : null}
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" }}>{model}</View>
        <View style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <ComposerActionArea />
          {submit}
        </View>
      </AIInput.Toolbar>
    </AIInput>
  );
}
