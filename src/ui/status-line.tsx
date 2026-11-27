import { Pressable, Text, View } from "react-native";
import Info from "lucide-react-native/icons/info";
import CircleCheck from "lucide-react-native/icons/circle-check";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import { decorativeSvgProps } from "./accessibility";
import { useMobileTheme } from "./theme";
import { BusyIndicator } from "./busy-glyph";
import { hitSlopFor, iconSize, lineHeight, opacity, space } from "./tokens";
import type { StatusLineProps } from "./component-props";

/**
 * One-line status (about 24 pt): a 16 status icon, text and an optional `TextAction`, no fill. For a slow read,
 * stale data, a waiting send or a later section whose failure another section already reports.
 */
export function StatusLine({ tone = "neutral", label, busy, action, color }: StatusLineProps) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const ink = color ?? (tone === "neutral" ? colors.muted : semanticColors[tone].text);
  const Icon = tone === "danger" ? CircleAlert : tone === "warning" ? TriangleAlert : tone === "success" ? CircleCheck : Info;
  return (
    <View accessibilityLiveRegion="polite" style={uiStyles.statusLine}>
      {busy ? <BusyIndicator size="sm" color={ink} />
        : <Icon {...decorativeSvgProps} size={iconSize.status} strokeWidth={2} color={ink} />}
      <Text accessibilityRole={tone === "danger" ? "alert" : undefined} style={[uiStyles.statusLineText, { color: ink }]}>
        {label}
      </Text>
      {action ? <TextAction label={action.label} color={color ?? colors.accent} onPress={action.onPress} /> : null}
    </View>
  );
}

/**
 * A 13/17 semibold text link inside a status or notice line ("Retry", "Details"). The line keeps its
 * compact height; hitSlop grows the target to 48 and pressing dims the label, so it never feels dead.
 */
export function TextAction({ label, color, onPress, accessibilityLabel, expanded }: {
  label: string;
  color: string;
  onPress: () => void;
  accessibilityLabel?: string;
  expanded?: boolean;
}) {
  const { uiStyles } = useMobileTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={expanded === undefined ? undefined : { expanded }} aria-expanded={expanded}
      // Vertical slop grows the one 13/17 text line to the 48 touch target.
      hitSlop={{ ...hitSlopFor(lineHeight.small), left: space.sm + 2, right: space.sm + 2 }} onPress={onPress}
      style={({ pressed }) => ({ alignSelf: "flex-start", opacity: pressed ? opacity.pressed : 1 })}>
      <Text style={[uiStyles.statusLineAction, { color }]}>{label}</Text>
    </Pressable>
  );
}
