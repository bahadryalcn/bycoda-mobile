import { StyleSheet, View } from "react-native";
import Check from "lucide-react-native/icons/check";
import Animated from "react-native-reanimated";
import { usePressMotion } from "./motion";
import { Body } from "./typography";
import { colors, metrics, opacity, semanticColors, space } from "./tokens";
import { uiStyles } from "./styles";
import { Button as GlueButton, ButtonText, ButtonSpinner } from "./gluestack/button";
import { Pressable as GluePressable } from "./gluestack/pressable";
import { controlClasses, rowClasses } from "./design-system";
import type {
  ButtonProps,
  ChoiceChipProps,
  PressableCardProps,
  SelectRowProps,
  IconButtonProps,
} from "./component-props";

const AnimatedButton = Animated.createAnimatedComponent(GlueButton);
export function Button({
  label,
  onPress,
  disabled,
  busy,
  selected,
  tone = "default",
  density = "regular",
  fullWidth,
  style,
  children,
}: ButtonProps) {
  const press = usePressMotion();
  const off = !!(disabled || busy);
  const semantic =
    tone === "default" || tone === "primary" || tone === "secondary" || tone === "quiet"
      ? undefined
      : semanticColors[tone];
  const foreground = tone === "primary" ? colors.primaryText : (semantic?.text ?? colors.text);
  return (
    <AnimatedButton
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!busy, selected: !!selected }}
      isDisabled={off}
      disabled={off}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      variant={
        tone === "primary"
          ? "default"
          : tone === "quiet"
            ? "ghost"
            : tone === "secondary"
              ? "secondary"
              : "outline"
      }
      className={controlClasses({ tone, density, selected })}
      style={[
        { alignSelf: fullWidth ? "stretch" : "flex-start", opacity: off ? opacity.disabled : 1 },
        fullWidth && { width: "100%" },
        style,
        press.animatedStyle,
      ]}
    >
      {busy ? <ButtonSpinner color={foreground} /> : children}
      <ButtonText className="text-sm font-semibold" style={{ color: foreground }}>
        {label}
      </ButtonText>
    </AnimatedButton>
  );
}
export function ChoiceChip({ label, selected, ...props }: ChoiceChipProps) {
  return (
    <Button {...props} selected={selected} label={label} density={props.density ?? "compact"}>
      {selected ? <Check size={14} color={colors.accent} /> : null}
    </Button>
  );
}
export function PressableCard({
  label,
  children,
  selected,
  disabled,
  expanded,
  onPress,
  style,
}: PressableCardProps) {
  return (
    <GluePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !!disabled, expanded }}
      aria-expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      className={rowClasses}
      style={({ pressed }) =>
        StyleSheet.flatten([
          uiStyles.press,
          selected && uiStyles.selected,
          style,
          { opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1 },
        ])
      }
    >
      {children}
    </GluePressable>
  );
}
export function SelectRow({ label, detail, selected, onPress, disabled }: SelectRowProps) {
  return (
    <PressableCard
      label={[label, detail].filter(Boolean).join(". ")}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={[uiStyles.grow, { gap: 2 }]}>
          <Body numberOfLines={2} style={uiStyles.label}>
            {label}
          </Body>
          {detail ? (
            <Body muted numberOfLines={2} style={uiStyles.caption}>
              {detail}
            </Body>
          ) : null}
        </View>
        {selected ? <Check size={18} color={colors.accent} /> : null}
      </View>
    </PressableCard>
  );
}
export function IconButton({
  label,
  children,
  disabled,
  busy,
  onPress,
  density = "regular",
}: IconButtonProps) {
  const press = usePressMotion();
  const off = !!(disabled || busy);
  return (
    <AnimatedButton
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!busy }}
      isDisabled={off}
      disabled={off}
      variant="ghost"
      size="icon"
      className="min-h-control min-w-touch rounded-control border-0 bg-transparent p-ui-xs active:bg-accent"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        uiStyles.iconButton,
        density === "compact" && {
          minWidth: metrics.touchTarget,
          minHeight: metrics.touchTarget,
          padding: space.xxs,
        },
        { opacity: off ? opacity.disabled : 1 },
        press.animatedStyle,
      ]}
    >
      {busy ? <ButtonSpinner color={colors.accent} /> : children}
    </AnimatedButton>
  );
}
