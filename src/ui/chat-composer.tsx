import { useState, type ReactNode } from "react";
import { View, useWindowDimensions, type LayoutChangeEvent, type TextInputProps } from "react-native";
import { AIInput } from "panelui-native/components/ai-input";
import { fontSize, interfaceFont, lineHeight, metrics, radii, space } from "./tokens";
import { useMobileTheme } from "./theme";
import { ComposerActionArea } from "./composer-actions";
import { COMPOSER_FIELD_PADDING, COMPOSER_MAX_LINES, needsModelRow } from "./chat-composer-model";

/** Reserve the complete action height inside the composer capsule. */
const TOOLBAR_HEIGHT = metrics.touchTarget + space.xs;

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
  secondarySubmit,
  inlineSubmit = false,
  inlineLeading,
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
  /** Actions that stay in the toolbar when Send and Stop move alongside the field. */
  secondarySubmit?: ReactNode;
  inlineSubmit?: boolean;
  /** Optional recovery action in the short editor row. Add stays in the toolbar in this case. */
  inlineLeading?: ReactNode;
  onToolbarLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { colors } = useMobileTheme();
  const { fontScale, width } = useWindowDimensions();
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const separateModel = !!model && needsModelRow(toolbarWidth || width, scale);
  const { style, ...rest } = field;
  const leadingActions = <View key="leading" style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: space.xs }}>
    {inlineSubmit && !inlineLeading ? null : leading}
    {mode}
  </View>;
  const modelActions = <View key="model" style={{ flex: separateModel ? undefined : 1, minWidth: 0,
    flexBasis: separateModel ? "100%" : undefined, flexDirection: "row", alignItems: "center" }}>{model}</View>;
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
      <View style={inlineSubmit ? { flexDirection: "row", alignItems: "flex-end" } : undefined}>
        {inlineSubmit ? <View style={{ paddingStart: space.xs }}>{inlineLeading ?? leading}</View> : null}
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
            inlineSubmit ? { flex: 1 } : undefined,
            style,
          ]}
        />
        {inlineSubmit ? <View style={{ flexDirection: "row", gap: space.xs, paddingEnd: space.xs }}>
          {submit}
        </View> : null}
      </View>
      <AIInput.Toolbar
        onLayout={(event) => {
          setToolbarWidth(event.nativeEvent.layout.width);
          onToolbarLayout?.(event);
        }}
        style={{
          minHeight: TOOLBAR_HEIGHT,
          gap: space.xs,
          flexWrap: separateModel ? "wrap" : "nowrap",
          justifyContent: separateModel ? "space-between" : "flex-start",
          paddingHorizontal: space.sm,
          paddingBottom: space.xs,
        }}
      >
        {separateModel ? [modelActions, leadingActions] : [leadingActions, modelActions]}
        <View style={{ marginStart: "auto", flexShrink: 0, flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <ComposerActionArea />
          {secondarySubmit}
          {inlineSubmit ? null : submit}
        </View>
      </AIInput.Toolbar>
    </AIInput>
  );
}
