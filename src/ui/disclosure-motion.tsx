import { useEffect } from "react";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { decorativeSvgProps } from "./accessibility";
import { motionTiming } from "./motion";

/**
 * The one expand/collapse indicator. `axis="right"` (default) is a tree or group row whose children
 * appear below it: a right chevron turning down. `axis="down"` is an in-place section (Disclosure,
 * RecordCard details): a down chevron turning up. 16 by default; the turn follows the system
 * reduced-motion setting through `motionTiming`. Decorative: the trigger carries the expanded state.
 */
export function DisclosureChevron({
  expanded,
  color,
  size = 16,
  axis = "right",
  closedAngle = 0,
  openAngle = axis === "down" ? 180 : 90,
}: {
  expanded: boolean;
  color: string;
  size?: number;
  axis?: "right" | "down";
  closedAngle?: number;
  openAngle?: number;
}) {
  const rotation = useSharedValue(expanded ? openAngle : closedAngle);
  useEffect(() => {
    rotation.value = withTiming(expanded ? openAngle : closedAngle, motionTiming);
  }, [expanded, rotation, closedAngle, openAngle]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const Glyph = axis === "down" ? ChevronDown : ChevronRight;
  return (
    <Animated.View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      style={[{ flexShrink: 0 }, style]}>
      <Glyph {...decorativeSvgProps} size={size} color={color} />
    </Animated.View>
  );
}
