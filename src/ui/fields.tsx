import { useMobileTheme } from "./theme";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Pressable, StyleSheet, View, type TextInputProps } from "react-native";
import { Switch } from "panelui-native/components/switch";
import { Input as PanelInput } from "panelui-native/components/input";
import { InputGroup } from "panelui-native/components/input-group";
import { Body } from "./typography";
import { FieldError } from "./feedback";
import { haptic } from "./motion";
import { metrics, opacity, space, gapIcon } from "./tokens";
import type { ToggleFieldProps, InputProps } from "./component-props";
import { useInNavigationGroup } from "./navigation-row";
import { HintLabel, InfoHint, InfoPanel, UnitHint, isUnitHint } from "./info-hint";

/**
 * The one boolean setting control: a row with a trailing Switch where the whole row toggles
 * (accessibility role `switch`). Inside a NavigationGroup it matches NavigationRow's padding,
 * icon slot and inset separator. An explanation goes in `help` (info icon that reveals on tap),
 * never as a paragraph under the label; `detail` is only a short status or current value.
 */
export function ToggleField({ label, labelLines, detail, help, value, onChange, disabled, icon }: ToggleFieldProps) {
  const { uiStyles, pressedFill } = useMobileTheme();
  const grouped = useInNavigationGroup();
  const [helpOpen, setHelpOpen] = useState(false);
  const toggle = () => {
    if (disabled) return;
    haptic.select();
    onChange(!value);
  };
  const row = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: gapIcon,
        minHeight: grouped ? metrics.rowHeightProject : metrics.touchTarget,
        paddingHorizontal: grouped ? space.sm : 0,
        paddingVertical: grouped ? space.row : 0,
        opacity: disabled ? opacity.disabled : 1,
      }}
    >
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={help ?? detail}
        accessibilityState={{ checked: value, disabled: !!disabled }}
        aria-checked={value}
        aria-disabled={!!disabled}
        disabled={disabled}
        onPress={toggle}
        style={({ pressed }) => [
          { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: gapIcon, minHeight: metrics.touchTarget },
          pressed && { backgroundColor: pressedFill },
        ]}
      >
        {icon ? <View style={{ alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</View> : null}
        <View style={[uiStyles.grow, { gap: space.xxs }]}>
          <Body style={uiStyles.label} numberOfLines={labelLines}>{label}</Body>
          {detail ? <Body muted style={uiStyles.caption}>{detail}</Body> : null}
          <InfoPanel text={help ?? ""} open={helpOpen} />
        </View>
      </Pressable>
      {help ? <InfoHint text={help} open={helpOpen} onToggle={() => setHelpOpen((v) => !v)} /> : null}
      {/* The row owns the announcement and the tap; the Switch only draws the state. */}
      <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch value={value} onValueChange={toggle} disabled={disabled} />
      </View>
    </View>
  );
  // Same rhythm as NavigationRow: optional leading icon slot and an inset separator in groups.
  return grouped ? <View>{row}<View accessible={false} style={uiStyles.separator} /></View> : row;
}

/** One field adapter owns native refs, composer resizing and validation styling. */
export function Input({
  label,
  mono,
  style,
  error,
  hint,
  tone = "default",
  onFocus,
  onBlur,
  ref,
  suffix,
  ...props
}: InputProps & { suffix?: string }) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const Control = suffix ? InputGroup.Input : PanelInput;
  const [focused, setFocused] = useState(false);
  const semantic = error
    ? semanticColors.danger
    : tone === "default"
      ? undefined
      : semanticColors[tone];
  // Layout belongs to the outer field, not the TextInput inside PanelUI's own
  // container. In particular, ActionField relies on flexBasis to wrap its action.
  const { flex, flexGrow, flexShrink, flexBasis, alignSelf, width, minWidth, maxWidth, ...fieldStyle } =
    StyleSheet.flatten(style) ?? {};
  return (
    <View
      style={{
        minWidth: minWidth ?? 0,
        flex,
        flexGrow,
        flexShrink,
        flexBasis,
        alignSelf: alignSelf ?? "stretch",
        width,
        maxWidth,
      }}
    >
      <FieldGroup suffix={suffix} disabled={props.editable === false}>
      <Control
        {...props}
        ref={ref as ComponentProps<typeof PanelInput>["ref"]}
        disabled={props.editable === false}
        aria-disabled={props.editable === false}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint ?? props.accessibilityHint}
        aria-invalid={Boolean(error)}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        className="h-auto text-foreground bg-fill rounded-control border-border"
        containerClassName="gap-0"
        onFocus={(event: Parameters<NonNullable<TextInputProps["onFocus"]>>[0]) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event: Parameters<NonNullable<TextInputProps["onBlur"]>>[0]) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={StyleSheet.flatten([
          uiStyles.input,
          props.multiline ? uiStyles.multiline : { textAlignVertical: "center" },
          // Monospace is a font choice, not a smaller editable text size.
          mono && { fontFamily: uiStyles.mono.fontFamily },
          semantic && { borderColor: semantic.border },
          focused && { borderWidth: 1, borderColor: semantic?.text ?? colors.accent },
          props.editable === false && { color: colors.muted },
          fieldStyle,
          // Keep focus local to the editable field; never recolor its containing panel.
          process.env.EXPO_OS === "web" && ({ outlineStyle: "none", resize: "none" } as object),
        ])}
      />
      </FieldGroup>
    </View>
  );
}

/** A trailing unit uses PanelUI InputGroup so the text never runs under it. */
function FieldGroup({ suffix, disabled, children }: { suffix?: string; disabled: boolean; children: ReactNode }) {
  const { colors, uiStyles } = useMobileTheme();
  if (!suffix) return <>{children}</>;
  return (
    <InputGroup isDisabled={disabled}>
      {children}
      <InputGroup.Suffix isDecorative>
        <Body style={[uiStyles.caption, { color: colors.muted }]}>{suffix}</Body>
      </InputGroup.Suffix>
    </InputGroup>
  );
}

export function Field({ label, hint, info, error, ...props }: InputProps) {
  const { uiStyles } = useMobileTheme();
  return (
    <View style={[uiStyles.field, (error || isUnitHint(hint)) && { paddingBottom: space.xs }]}>
      <HintLabel label={label} help={info ?? hint} always={!!info} />
      <Input label={label} error={error} hint={hint} {...props} />
      {error ? <FieldError message={error} /> : <UnitHint hint={hint} />}
    </View>
  );
}

export function IdentifierField(props: InputProps) {
  useMobileTheme();
  return <Field autoCapitalize="none" autoCorrect={false} {...props} />;
}
