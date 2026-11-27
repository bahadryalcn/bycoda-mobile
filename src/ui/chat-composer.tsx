import { useState, type ReactNode } from "react";
import { StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type TextInputProps } from "react-native";
import Animated from "react-native-reanimated";
import { AIInput } from "panelui-native/components/ai-input";
import { fontSize, interfaceFont, lineHeight, metrics, radii, space } from "./tokens";
import { useMobileTheme } from "./theme";
import { ComposerActionArea } from "./composer-actions";
import { COMPOSER_FIELD_PADDING, COMPOSER_MAX_LINES, composerToolbarLayout } from "./chat-composer-model";
import { reveal } from "./motion";

/** Reserve the complete action height inside the composer capsule. */
const TOOLBAR_HEIGHT = metrics.touchTarget + space.xs;

/** The model slot may render a full label or, when its measured width is short, only a mark. */
export type ComposerModelPresentation = { iconOnly: boolean };

/**
 * The feature owns drafts and dispatch; this facade owns composer presentation: one capsule with a
 * full-width field that starts at one line (48dp) and grows to five before scrolling, then one
 * non-wrapping toolbar row `[leading] [model, flex] [status] [secondary] [submit]`. The toolbar is
 * visible at rest too, so focusing the field never changes the capsule height.
 *
 * `actionRow` temporarily takes the toolbar's place (a dictation recording row), as PanelUI's
 * `AIInput.Recording` does: the field, its draft, focus and keyboard stay mounted, and the row keeps
 * the toolbar's container, height floor and layout callback, so composer measurement is unchanged.
 */
export function ChatComposer({
  value,
  onValueChange,
  disabled,
  field,
  top,
  leading,
  model,
  status,
  submit,
  secondarySubmit,
  inlineSubmit = false,
  inlineLeading,
  onToolbarLayout,
  actionRow,
  mono = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  field: Omit<TextInputProps, "value" | "onChangeText" | "editable" | "multiline">;
  /** Notes and attachments live inside the capsule, above the field. */
  top?: ReactNode;
  leading: ReactNode;
  /** The flexible middle of the toolbar; a function receives the measured presentation. */
  model?: ReactNode | ((presentation: ComposerModelPresentation) => ReactNode);
  /** Optional state control that joins the row only when the model keeps one touch target. */
  status?: ReactNode;
  submit: ReactNode;
  /** Actions that stay in the toolbar when Send and Stop move alongside the field. */
  secondarySubmit?: ReactNode;
  /** Short keyboard frames place the primary actions beside the field. */
  inlineSubmit?: boolean;
  /** Optional recovery action in the short editor row. Add stays in the toolbar in this case. */
  inlineLeading?: ReactNode;
  onToolbarLayout?: (event: LayoutChangeEvent) => void;
  /** Replaces the toolbar's controls (and the short-frame actions beside the field) while set. */
  actionRow?: ReactNode;
  /** Monospace text at the composer's own size (terminal commands), as `Input mono` does. */
  mono?: boolean;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const { fontScale, width } = useWindowDimensions();
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const [leadingWidth, setLeadingWidth] = useState(0);
  const [trailingWidth, setTrailingWidth] = useState(0);
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const layout = composerToolbarLayout({
    toolbar: toolbarWidth || width,
    leading: leadingWidth,
    trailing: trailingWidth,
    status: !!status,
    fontScale: scale,
  });
  const { style, placeholder, accessibilityLabel, ...rest } = field;
  // A replacing action row owns every action; nothing else sits beside the field meanwhile.
  const besideField = inlineSubmit && !actionRow;
  const duplicatePlaceholder = process.env.EXPO_OS === "ios" && !!placeholder && placeholder === accessibilityLabel;
  const nativeScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const textScale = field.allowFontScaling === false ? 1 : Math.min(nativeScale, field.maxFontSizeMultiplier || Infinity);
  const line = lineHeight.input * textScale;
  const padding = COMPOSER_FIELD_PADDING;
  const { maxHeight, ...fieldStyle } = StyleSheet.flatten(style) ?? {};
  const available = typeof maxHeight === "number" ? maxHeight - padding * 2 : line * COMPOSER_MAX_LINES;
  const lines = Math.max(1, Math.min(COMPOSER_MAX_LINES, Math.floor(available / line)));
  const minimum = Math.max(metrics.composerFieldMin - padding * 2, Math.ceil(line));
  const fieldType = { fontSize: fontSize.input, lineHeight: lineHeight.input, fontFamily: mono ? uiStyles.mono.fontFamily : interfaceFont };
  const measureWidth = (set: (width: number) => void) => (event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.width);
    if (Number.isFinite(next) && next >= 0) set(next);
  };
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
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        // Clips child surfaces to the rounded capsule; content never depends on it.
        overflow: "hidden",
        opacity: 1,
      }}
    >
      {top}
      <View style={besideField ? { flexDirection: "row", alignItems: "flex-end" } : undefined}>
        {besideField ? <View style={{ paddingStart: space.xs }}>{inlineLeading ?? leading}</View> : null}
        <View style={{ minWidth: 0, paddingVertical: padding, ...(besideField ? { flex: 1 } : {}) }}>
          <AIInput.Field
            placeholder={duplicatePlaceholder ? "" : placeholder}
            accessibilityLabel={accessibilityLabel}
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            {...rest}
            style={{
              ...fieldType,
              paddingTop: 0,
              paddingBottom: 0,
              paddingHorizontal: space.lg,
              color: colors.text,
              includeFontPadding: false,
              textAlignVertical: "top",
              ...fieldStyle,
              minHeight: minimum,
              maxHeight: Math.max(minimum, Math.ceil(line * lines)),
            }}
          />
          {/* UIKit appends its placeholder to the explicit name. Keep the name and draw the hint once. */}
          {duplicatePlaceholder && !value ? (
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={{ position: "absolute", top: padding, start: space.lg, end: space.lg }}>
              <Text allowFontScaling={field.allowFontScaling} maxFontSizeMultiplier={field.maxFontSizeMultiplier}
                style={{ ...fieldType, color: colors.muted }}>{placeholder}</Text>
            </View>
          ) : null}
        </View>
        {besideField ? <View style={{ flexDirection: "row", gap: space.xs, paddingEnd: space.xs }}>
          {submit}
        </View> : null}
      </View>
      <AIInput.Toolbar
        onLayout={(event) => {
          measureWidth(setToolbarWidth)(event);
          onToolbarLayout?.(event);
        }}
        style={{
          minHeight: TOOLBAR_HEIGHT,
          gap: space.xs,
          flexWrap: "nowrap",
          alignItems: "center",
          paddingHorizontal: space.sm,
          paddingBottom: space.xs,
        }}
      >
        {actionRow ? (
          <Animated.View key="action-row" entering={reveal}
            style={{ flex: 1, minWidth: 0, minHeight: metrics.touchTarget, flexDirection: "row", alignItems: "center", gap: space.xs }}>
            {actionRow}
          </Animated.View>
        ) : [
          <View key="leading" onLayout={measureWidth(setLeadingWidth)}
            style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: space.xs }}>
            {inlineSubmit && !inlineLeading ? null : leading}
          </View>,
          <View key="model" style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" }}>
            {typeof model === "function" ? model({ iconOnly: layout.iconOnly }) : model}
          </View>,
          status && layout.showStatus ? <View key="status" style={{ flexShrink: 0 }}>{status}</View> : null,
          <View key="trailing" onLayout={measureWidth(setTrailingWidth)}
            style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <ComposerActionArea />
            {secondarySubmit}
            {inlineSubmit ? null : submit}
          </View>,
        ]}
      </AIInput.Toolbar>
    </AIInput>
  );
}
