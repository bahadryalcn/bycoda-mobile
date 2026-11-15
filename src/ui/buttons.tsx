import { useMobileTheme } from "./theme";
import { Pressable, StyleSheet, View } from "react-native";
import { ProgressButton as PanelProgressButton } from "panelui-native/components/progress-button";
import Check from "lucide-react-native/icons/check";
import { Body } from "./typography";
import { hitSlopFor, metrics, opacity, radii, space } from "./tokens";
import { LifecycleButton as PanelButton } from "./busy-indicator";
import { useSoleSpinner } from "./spinner-claim";
import { controlClasses } from "./design-system";
import { haptic } from "./motion";
import { useCopy } from "./copy";
import type {
  ButtonProps,
  ChoiceChipProps,
  PressableCardProps,
  SelectRowProps,
  IconButtonProps,
} from "./component-props";


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
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const off = !!(disabled || busy);
  const spinner = useSoleSpinner(!!busy);
  const semantic =
    tone === "default" || tone === "primary" || tone === "secondary" || tone === "quiet"
      ? undefined
      : semanticColors[tone];
  const foreground =
    disabled && !busy && tone !== "primary" ? colors.muted : tone === "primary"
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
      loading={spinner}
      quietBusy={!!busy && !spinner}
      pressScale={1}
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
      hitSlop={hitSlopFor(density === "compact" ? metrics.chipHeight : metrics.buttonHeight)}
      className={controlClasses({ tone, density, selected })}
      labelClassName={
        tone === "primary"
          ? "text-primary-foreground text-sm font-semibold"
          : "text-foreground text-sm font-semibold"
      }
      startContent={children}
      style={[
        { alignSelf: fullWidth ? "stretch" : "flex-start", maxWidth: "100%", flexShrink: 1,
          borderRadius: radii.control, opacity: disabled && !busy ? opacity.disabled : 1 },
        fullWidth && { width: "100%" },
        style,
        disabled && !busy && tone === "primary" && { backgroundColor: colors.accentSolid },
      ]}
    >
      <Body selectable={false} style={[uiStyles.buttonLabel, { color: foreground, textAlign: "center" }]}>
        {label}
      </Body>
    </PanelButton>
  );
}
export function ChoiceChip({ label, selected, ...props }: ChoiceChipProps) {
  const { colors } = useMobileTheme();
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
  onLongPress,
  optionsLabel,
  style,
  role = "button",
  hitSlop,
}: PressableCardProps) {
  const { colors, uiStyles, pressedFill } = useMobileTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      hitSlop={hitSlop}
      accessibilityState={{ selected, disabled: !!disabled, expanded, ...(role === "radio" ? { checked: !!selected } : {}) }}
      aria-disabled={!!disabled}
      aria-pressed={selected}
      aria-expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityActions={!disabled && onLongPress && optionsLabel ? [{ name: "longpress", label: optionsLabel }] : undefined}
      onAccessibilityAction={(event) => {
        if (!disabled && event.nativeEvent.actionName === "longpress") onLongPress?.();
      }}
      style={({ pressed }) => [
        StyleSheet.flatten([
          uiStyles.press,
          selected && uiStyles.selected,
          style,
          { opacity: disabled ? opacity.disabled : 1 },
        ]),
        pressed && !disabled && { backgroundColor: selected ? colors.selected : pressedFill },
      ]}
    >
      {children}
    </Pressable>
  );
}
export function SelectRow({ label, detail, selected, onPress, disabled }: SelectRowProps) {
  const { colors, uiStyles } = useMobileTheme();
  return (
    <PressableCard
      label={[label, detail].filter(Boolean).join(". ")}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={[uiStyles.grow, { gap: space.xxs }]}>
          <Body style={uiStyles.label}>
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
  onLongPress,
  density = "regular",
  tone = "default",
  expanded,
}: IconButtonProps) {
  const { colors, uiStyles } = useMobileTheme();
  const off = !!(disabled || busy);
  const spinner = useSoleSpinner(!!busy);
  return (
    <PanelButton
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!busy, expanded }}
      aria-disabled={off}
      aria-busy={busy || undefined}
      aria-expanded={expanded}
      disabled={off}
      loading={spinner}
      quietBusy={!!busy && !spinner}
      pressScale={1}
      spinnerProps={{ color: tone === "primary" ? colors.primaryText : tone === "danger" ? colors.danger : colors.accent }}
      startContent={children}
      variant={tone === "primary" ? "primary" : "ghost"}
      size="icon"
      className={
        tone === "primary"
          ? "min-h-visual min-w-visual rounded-full border-0 shadow-none bg-primary p-ui-xs active:opacity-75"
          : "min-h-visual min-w-visual rounded-full border-0 shadow-none bg-transparent p-ui-xs active:bg-fill active:opacity-75"
      }
      hitSlop={hitSlopFor(density === "compact" ? metrics.chipHeight : metrics.visualControl)}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        uiStyles.iconButton,
        density === "compact" && {
          minWidth: metrics.chipHeight,
          minHeight: metrics.chipHeight,
          padding: space.xxs,
        },
        { opacity: disabled && !busy ? opacity.disabled : 1 },
      ]}
    />
  );
}

export type ProgressButtonProps = {
  label: string;
  /** Fires once the hold has been sustained to the end (or from the screen reader's activate action). */
  onComplete: () => void;
  accessibilityLabel?: string;
  /** Milliseconds to hold. Defaults to 1200: long enough to be deliberate, short enough to finish. */
  holdDuration?: number;
  tone?: "primary" | "secondary" | "danger" | "success";
  disabled?: boolean;
  /** An operation is already running: refuses a second hold, like Button's double-submit protection. */
  busy?: boolean;
  /** Return to the unfilled state after completion; leave false when the action navigates away. */
  autoReset?: boolean;
  fullWidth?: boolean;
  style?: ButtonProps["style"];
};

const progressTones = { primary: "primary", secondary: "secondary", danger: "destructive", success: "success" } as const;

/**
 * Press-and-hold confirmation drawn on the button: the fill is the wait, and nothing fires until it
 * completes. Use it instead of a confirm dialog for one deliberate, hard-to-undo action (erase,
 * revoke, discard); not for routine submits and not for progress of an operation that is already
 * running (use Loading or Notice). Screen readers get an ordinary activate action that completes
 * at once, since holding is not possible there. Matches Button's height and corner.
 */
export function ProgressButton({
  label, accessibilityLabel, onComplete, holdDuration = 1200, tone = "danger", disabled, busy,
  autoReset = true, fullWidth, style,
}: ProgressButtonProps) {
  const copy = useCopy();
  const off = !!(disabled || busy);
  const complete = () => { if (!off) onComplete(); };
  return (
    <PanelProgressButton
      variant={progressTones[tone]}
      size="lg"
      shape="rounded"
      holdDuration={holdDuration}
      autoReset={autoReset}
      disabled={off}
      haptics
      fullWidth={fullWidth}
      onComplete={complete}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={copy("Onaylamak için basılı tut", "Press and hold to confirm")}
      accessibilityActions={[{ name: "activate", label }]}
      onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === "activate") complete(); }}
      aria-busy={busy || undefined}
      hitSlop={hitSlopFor(metrics.buttonHeight)}
      style={[{ alignSelf: fullWidth ? "stretch" : "flex-start", maxWidth: "100%" }, style]}
    >
      <PanelProgressButton.Label>{label}</PanelProgressButton.Label>
    </PanelProgressButton>
  );
}
