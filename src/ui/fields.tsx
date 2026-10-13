import { useState } from "react";
import { StyleSheet, View, type TextInputProps } from "react-native";
import { Switch } from "./gluestack/switch";
import { Input as InputRoot, InputField } from "./gluestack/input";
import {
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  FormControlError,
  FormControlErrorText,
  FormControlHelper,
  FormControlHelperText,
} from "./gluestack/form-control";
import { Body } from "./typography";
import { colors, metrics, semanticColors, space } from "./tokens";
import { uiStyles } from "./styles";
import type { ToggleFieldProps, InputProps } from "./component-props";

export function ToggleField({
  label,
  detail,
  value,
  onChange,
  disabled,
  tone = "default",
}: ToggleFieldProps) {
  // React Native Web uses a separate active thumb color; native uses thumbColor for both states.
  const webColors = process.env.EXPO_OS === "web" ? { activeThumbColor: colors.primaryText } : {};
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        minHeight: metrics.selectionHeight,
      }}
    >
      <View style={[uiStyles.grow, { gap: 2 }]}>
        <Body>{label}</Body>
        {detail ? (
          <Body muted style={uiStyles.caption}>
            {detail}
          </Body>
        ) : null}
      </View>
      <Switch
        {...webColors}
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{
          false: colors.raised,
          true: tone === "default" ? colors.accentSolid : semanticColors[tone].border,
        }}
        thumbColor={value ? colors.primaryText : colors.text}
        ios_backgroundColor={colors.raised}
      />
    </View>
  );
}

export function Input({
  label,
  mono,
  style,
  error,
  hint: _hint,
  tone = "default",
  onFocus,
  onBlur,
  ref,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const semantic = error
    ? semanticColors.danger
    : tone === "default"
      ? undefined
      : semanticColors[tone];
  const layout = StyleSheet.flatten(style);
  return (
    <InputRoot
      isInvalid={Boolean(error)}
      isDisabled={props.editable === false}
      className="min-h-0 h-auto w-auto border-0 bg-transparent dark:bg-transparent p-0 overflow-visible"
      style={{
        backgroundColor: "transparent",
        minWidth: 0,
        flex: layout?.flex,
        flexGrow: layout?.flexGrow,
        flexShrink: layout?.flexShrink,
        alignSelf: layout?.alignSelf ?? "stretch",
        width: layout?.width,
        maxWidth: layout?.maxWidth,
        height: layout?.height,
        minHeight:
          layout?.minHeight ?? (props.multiline ? metrics.multilineHeight : metrics.inputHeight),
        maxHeight: layout?.maxHeight,
      }}
    >
      <InputField
        {...props}
        ref={ref}
        className="h-auto text-foreground text-sm p-0"
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        accessibilityHint={error ?? _hint ?? props.accessibilityHint}
        onFocus={(event: Parameters<NonNullable<TextInputProps["onFocus"]>>[0]) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event: Parameters<NonNullable<TextInputProps["onFocus"]>>[0]) => {
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
        ])}
      />
    </InputRoot>
  );
}

export function Field({ label, hint, error, ...props }: InputProps) {
  return (
    <FormControl
      isInvalid={Boolean(error)}
      isDisabled={props.editable === false}
      style={uiStyles.field}
    >
      <FormControlLabel className="m-0">
        <FormControlLabelText style={StyleSheet.flatten([uiStyles.fieldLabel])}>
          {label}
        </FormControlLabelText>
      </FormControlLabel>
      <Input label={label} error={error} hint={hint} {...props} />
      {error ? (
        <FormControlError className="m-0">
          <FormControlErrorText
            selectable
            accessibilityRole="alert"
            style={StyleSheet.flatten([uiStyles.error])}
          >
            {error}
          </FormControlErrorText>
        </FormControlError>
      ) : hint ? (
        <FormControlHelper className="m-0">
          <FormControlHelperText selectable style={StyleSheet.flatten([uiStyles.caption])}>
            {hint}
          </FormControlHelperText>
        </FormControlHelper>
      ) : null}
    </FormControl>
  );
}

export function IdentifierField(props: InputProps) {
  return <Field autoCapitalize="none" autoCorrect={false} {...props} />;
}
