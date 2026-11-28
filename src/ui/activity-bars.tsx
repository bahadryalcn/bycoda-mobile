import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useAnimationLead } from "./animation-lead";
import { useFeedbackAnimation } from "./use-feedback-animation";
import { useMobileTheme } from "./theme";
import { radii } from "./tokens";

const HEIGHT = 12;
const BAR = 2;
/** Still frame: uneven heights so the mark still reads as activity when it may not move. */
const REST = [0.45, 0.85, 0.6, 1];
/** Phase offsets of each bar within one beat, in ms. */
const PHASE = [0, 320, 160, 480];
const BEAT = 520;

/**
 * Desktop's "something is running here" mark: a few equalizer bars beside a group's identity. It
 * says work is in flight inside a folded group without opening it. Bars move only while feedback
 * animation is allowed and this mark holds the shared animation lead; otherwise they keep an
 * uneven still frame. Decorative: the owning row's spoken label carries the running state.
 */
export function ActivityBars({ color, priority = -1 }: { color?: string; priority?: number }) {
  const { semanticColors } = useMobileTheme();
  const animate = useAnimationLead(useFeedbackAnimation(), priority);
  const fill = color ?? semanticColors.info.text;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ flexDirection: "row", alignItems: "center", gap: BAR, height: HEIGHT }}
    >
      {REST.map((rest, index) => (
        <Bar key={index} rest={rest} phase={PHASE[index]!} animate={animate} color={fill} />
      ))}
    </View>
  );
}

function Bar({ rest, phase, animate, color }: { rest: number; phase: number; animate: boolean; color: string }) {
  const level = useSharedValue(rest);
  useEffect(() => {
    if (!animate) {
      cancelAnimation(level);
      level.value = rest;
      return;
    }
    const ease = Easing.inOut(Easing.quad);
    level.value = withDelay(phase, withRepeat(withSequence(
      withTiming(1, { duration: BEAT, easing: ease }),
      withTiming(0.25, { duration: BEAT, easing: ease }),
    ), -1, false));
    return () => cancelAnimation(level);
  }, [animate, level, phase, rest]);
  return <BarShape level={level} color={color} />;
}

function BarShape({ level, color }: { level: SharedValue<number>; color: string }) {
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: level.value }] }));
  return <Animated.View style={[{ width: BAR, height: HEIGHT, borderRadius: radii.pill, backgroundColor: color }, style]} />;
}
