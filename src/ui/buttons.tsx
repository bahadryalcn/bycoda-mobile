import { useMobileTheme } from "./theme";
import { Pressable, StyleSheet, View } from "react-native";
import Check from "lucide-react-native/icons/check";
import { Body } from "./typography";
import { colors, metrics, opacity, semanticColors, space } from "./tokens";
import { uiStyles } from "./styles";
import { LifecycleButton as PanelButton } from "./busy-indicator";
import { controlClasses } from "./design-system";
import { useReducedMotionPreference } from "./use-reduced-motion";
import Animated from "react-native-reanimated";
import { haptic, usePressMotion } from "./motion";
import type {
  ButtonProps,
  ChoiceChipProps,
  PressableCardProps,
  SelectRowProps,
  IconButtonProps,
} from "./component-props";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  accessibilityLabel,
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
  useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  const off = !!(disabled || busy);
  const semantic =
    tone === "default" || tone === "primary" || tone === "secondary" || tone === "quiet"
      ? undefined
      : semanticColors[tone];
  const foreground =
    tone === "primary"
      ? colors.primaryText
      : tone === "secondary" || tone === "quiet" || selected
        ? colors.accent
        : (semantic?.text ?? colors.text);
  return (
    <PanelButton
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: !!busy, selected: !!selected }}
      aria-disabled={off}
      aria-busy={busy || undefined}
      aria-pressed={selected}
      disabled={off}
      loading={busy}
      pressScale={reducedMotion ? 1 : 0.96}
      spinnerProps={{ color: foreground }}
      onPress={() => {
        if (tone === "primary") haptic.tap();
        onPress();
      }}
      variant={
        tone === "primary"
          ? "primary"
          : tone === "quiet"
            ? "ghost"
            : tone === "secondary"
              ? "secondary"
              : "outline"
      }
      className={controlClasses({ tone, density, selected })}
      labelClassName={
        tone === "primary"
          ? "text-primary-foreground text-sm font-semibold"
          : "text-foreground text-sm font-semibold"
      }
      startContent={children}
      style={[
        { alignSelf: fullWidth ? "stretch" : "flex-start", maxWidth: "100%", flexShrink: 1, opacity: off ? opacity.disabled : 1 },
        fullWidth && { width: "100%" },
        style,
      ]}
    >
      <Body selectable={false} style={[uiStyles.buttonLabel, { color: foreground, textAlign: "center" }]}>
        {label}
      </Body>
    </PanelButton>
  );
}
export function ChoiceChip({ label, selected, ...props }: ChoiceChipProps) {
  useMobileTheme();
  return (
    <Button
      {...props}
      onPress={() => {
        haptic.select();
        props.onPress();
      }}
      selected={selected}
      label={label}
      density={props.density ?? "compact"}
    >
      {selected ? <Check size={14} strokeWidth={2.4} color={colors.accent} /> : null}
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
  useMobileTheme();
  const press = usePressMotion(0.98);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !!disabled, expanded }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      aria-disabled={!!disabled}
      aria-pressed={selected}
      aria-expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      style={[
        StyleSheet.flatten([
          uiStyles.press,
          selected && uiStyles.selected,
          style,
          { opacity: disabled ? opacity.disabled : 1 },
        ]),
        press.animatedStyle,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}
export function SelectRow({ label, detail, selected, onPress, disabled }: SelectRowProps) {
  useMobileTheme();
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
        {selected ? <Check size={18} strokeWidth={2.4} color={colors.accent} /> : null}
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
  tone = "default",
  expanded,
}: IconButtonProps) {
  useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  const off = !!(disabled || busy);
  return (
    <PanelButton
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!busy, expanded }}
      aria-disabled={off}
      aria-busy={busy || undefined}
      aria-expanded={expanded}
      disabled={off}
      loading={busy}
      pressScale={reducedMotion ? 1 : 0.9}
      spinnerProps={{ color: tone === "primary" ? colors.primaryText : colors.accent }}
      startContent={children}
      variant={tone === "primary" ? "primary" : "ghost"}
      size="icon"
      className={
        tone === "primary"
          ? "min-h-control min-w-touch rounded-full border-0 shadow-none bg-primary p-ui-xs"
          : "min-h-control min-w-touch rounded-full border-0 shadow-none bg-transparent p-ui-xs active:bg-fill"
      }
      onPress={onPress}
      style={[
        uiStyles.iconButton,
        density === "compact" && {
          minWidth: metrics.touchTarget,
          minHeight: metrics.touchTarget,
          padding: space.xxs,
        },
        { opacity: off ? opacity.disabled : 1 },
      ]}
    />
  );
}
