import { Pressable, Text, View } from "react-native";
import { Spinner } from "panelui-native/components/spinner";
import Info from "lucide-react-native/icons/info";
import CircleCheck from "lucide-react-native/icons/circle-check";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import { decorativeSvgProps } from "./accessibility";
import { useMobileTheme } from "./theme";
import { radii } from "./tokens";
import { useFeedbackAnimation } from "./use-feedback-animation";
import type { StatusLineProps } from "./component-props";

/**
 * One-line status (about 24 pt): icon, text and an optional text action, no fill. For a slow read,
 * stale data, a waiting send or a later section whose failure another section already reports.
 */
export function StatusLine({ tone = "neutral", label, busy, action, color }: StatusLineProps) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const animate = useFeedbackAnimation();
  const ink = color ?? (tone === "neutral" ? colors.muted : semanticColors[tone].text);
  const Icon = tone === "danger" ? CircleAlert : tone === "warning" ? TriangleAlert : tone === "success" ? CircleCheck : Info;
  return (
    <View accessibilityLiveRegion="polite" style={uiStyles.statusLine}>
      {busy ? (
        animate ? <Spinner size="sm" color={ink} /> : (
          <View accessible={false} style={{ width: 14, height: 14, borderRadius: radii.pill, borderWidth: 2, borderColor: colors.border, borderTopColor: ink }} />
        )
      ) : <Icon {...decorativeSvgProps} size={14} strokeWidth={2} color={ink} />}
      <Text accessibilityRole={tone === "danger" ? "alert" : undefined} style={[uiStyles.statusLineText, { color: ink }]}>
        {label}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }} onPress={action.onPress}>
          <Text style={[uiStyles.statusLineAction, { color: color ?? colors.accent }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
