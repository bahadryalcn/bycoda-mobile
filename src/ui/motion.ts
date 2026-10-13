import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  FadeIn,
  FadeInDown,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import { motion } from "./tokens";

const timing = {
  duration: motion.press,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
};
export const reveal = FadeIn.duration(motion.reveal).reduceMotion(ReduceMotion.System);
export const enterSheet = FadeInDown.duration(motion.sheet).reduceMotion(ReduceMotion.System);
export const resize = LinearTransition.duration(motion.reveal).reduceMotion(ReduceMotion.System);

export const motionTiming = {
  duration: motion.reveal,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};

/** Shared press response, without animation timers or permanent motion. */
export function usePressMotion() {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    animatedStyle,
    onPressIn: () => {
      scale.value = withTiming(0.98, timing);
    },
    onPressOut: () => {
      scale.value = withTiming(1, timing);
    },
  };
}
