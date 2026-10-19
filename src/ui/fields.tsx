import { useMobileTheme } from "./theme";
import { useState } from "react";
import { StyleSheet, View, type TextInputProps } from "react-native";
import { Switch } from "panelui-native/components/switch";
import { Input as PanelInput } from "panelui-native/components/input";
import { Body } from "./typography";
import { haptic } from "./motion";
import { colors, metrics, semanticColors, space } from "./tokens";
import { uiStyles } from "./styles";
import type { ToggleFieldProps, InputProps } from "./component-props";
import { useInNavigationGroup } from "./navigation-row";

export function ToggleField({ label, detail, value, onChange, disabled }: ToggleFieldProps) {
  useMobileTheme();
  const grouped = useInNavigationGroup();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        minHeight: grouped ? 52 : metrics.selectionHeight,
        paddingHorizontal: grouped ? space.lg : 0,
        paddingVertical: grouped ? space.sm : 0,
      }}
    >
      <View style={[uiStyles.grow, { gap: 2 }]}>
        <Body style={uiStyles.label}>{label}</Body>
        {detail ? (
          <Body muted style={uiStyles.caption}>
            {detail}
          </Body>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={detail}
        value={value}
        onValueChange={(next: boolean) => {
          haptic.select();
          onChange(next);
        }}
        disabled={disabled}
      />
    </View>
  );
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
  ...props
}: InputProps) {
  useMobileTheme();
  const [focused, setFocused] = useState(false);
  const semantic = error
    ? semanticColors.danger
    : tone === "default"
      ? undefined
      : semanticColors[tone];
  const layout = StyleSheet.flatten(style);
  return (
    <View
      style={{
        minWidth: 0,
        flex: layout?.flex,
        flexGrow: layout?.flexGrow,
        flexShrink: layout?.flexShrink,
        alignSelf: layout?.alignSelf ?? "stretch",
        width: layout?.width,
        maxWidth: layout?.maxWidth,
      }}
    >
      <PanelInput
        {...props}
        ref={ref}
        disabled={props.editable === false}
        aria-disabled={props.editable === false}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint ?? props.accessibilityHint}
        aria-invalid={Boolean(error)}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        className="text-foreground bg-fill rounded-control border-transparent"
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
          mono && uiStyles.mono,
          semantic && { borderColor: semantic.border },
          focused && { borderColor: semantic?.text ?? colors.accent },
          props.editable === false && { color: colors.muted },
          style,
          // Focus is drawn by the accent border (or the composer capsule), not the browser ring.
          process.env.EXPO_OS === "web" && ({ outlineStyle: "none", resize: "none" } as object),
        ])}
      />
    </View>
  );
}

export function Field({ label, hint, error, ...props }: InputProps) {
  useMobileTheme();
  return (
    <View style={uiStyles.field}>
      <Body style={uiStyles.fieldLabel}>{label}</Body>
      <Input label={label} error={error} hint={hint} {...props} />
      {error ? (
        <Body accessibilityRole="alert" style={uiStyles.error}>
          {error}
        </Body>
      ) : hint ? (
        <Body muted style={uiStyles.caption}>
          {hint}
        </Body>
      ) : null}
    </View>
  );
}

export function IdentifierField(props: InputProps) {
  useMobileTheme();
  return <Field autoCapitalize="none" autoCorrect={false} {...props} />;
}
