import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { motion } from "./tokens";

/** Snappy, slightly damped iOS-like spring used for presses and indicators. */
export const pressSpring = {
  damping: 18,
  stiffness: 420,
  mass: 0.6,
  reduceMotion: ReduceMotion.System,
};
export const indicatorSpring = {
  damping: 22,
  stiffness: 260,
  mass: 0.8,
  reduceMotion: ReduceMotion.System,
};
export const reveal = FadeIn.duration(motion.reveal).reduceMotion(ReduceMotion.System);
export const dismiss = FadeOut.duration(motion.press).reduceMotion(ReduceMotion.System);
export const enterSheet = FadeInDown.duration(motion.sheet).reduceMotion(ReduceMotion.System);
export const resize = LinearTransition.springify()
  .damping(22)
  .stiffness(240)
  .reduceMotion(ReduceMotion.System);

/** Staggered entrance for short, non-virtualized lists and screen sections. */
export function enterItem(index = 0) {
  // Custom web entering keyframes restore an absolute snapshot after cleanup.
  // A built-in fade keeps sections in normal flow when the viewport changes.
  if (process.env.EXPO_OS === "web")
    return FadeIn.duration(motion.reveal)
      .delay(Math.min(index, 8) * 28)
      .reduceMotion(ReduceMotion.System);
  return FadeInDown.duration(motion.reveal)
    .delay(Math.min(index, 8) * 28)
    .withInitialValues({ transform: [{ translateY: 8 }] })
    .reduceMotion(ReduceMotion.System);
}

export const motionTiming = {
  duration: motion.reveal,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};

/** Shared press response: a quick spring down and back, never a permanent loop. */
export function usePressMotion(depth = 0.97) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    animatedStyle,
    onPressIn: () => {
      scale.value = withSpring(depth, pressSpring);
    },
    onPressOut: () => {
      scale.value = withSpring(1, pressSpring);
    },
  };
}

export function useFadeValue(initial = 1) {
  const value = useSharedValue(initial);
  return {
    value,
    to: (next: number) => {
      value.value = withTiming(next, motionTiming);
    },
  };
}

const nativeHaptics = process.env.EXPO_OS === "ios" || process.env.EXPO_OS === "android";
/** Light tactile confirmation; silently unavailable on web or unsupported devices. */
export const haptic = {
  tap() {
    if (nativeHaptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  select() {
    if (nativeHaptics) void Haptics.selectionAsync().catch(() => {});
  },
  success() {
    if (nativeHaptics)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning() {
    if (nativeHaptics)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
};
