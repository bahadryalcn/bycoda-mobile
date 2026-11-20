import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  // Not a hook: Reanimated reads the system setting once at startup and returns that constant.
  useReducedMotion as readSystemReducedMotion,
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
/** Selection indicators glide and settle without overshoot: no bounce past the target. */
export const indicatorTiming = {
  duration: motion.reveal,
  easing: Easing.bezier(0.2, 0, 0, 1),
  reduceMotion: ReduceMotion.System,
};
/**
 * With Android "Remove animations" (reduced motion) a layout animation's skipped entering left views at
 * opacity 0: the consent screen inside its overlay and the sign-in panel showed blank. Reduced motion
 * therefore gets no layout animation at all; views mount in their final state.
 */
export const stillMotion = readSystemReducedMotion();
const unlessStill = <T,>(animation: T): T | undefined => (stillMotion ? undefined : animation);
export const reveal = unlessStill(FadeIn.duration(motion.reveal).reduceMotion(ReduceMotion.System));
export const dismiss = unlessStill(FadeOut.duration(motion.press).reduceMotion(ReduceMotion.System));
export const enterSheet = unlessStill(FadeIn.duration(motion.sheet).reduceMotion(ReduceMotion.System));
/** Layout changes ease into place; a spring here made content bounce up and down. */
export const resize = unlessStill(LinearTransition.duration(motion.reveal)
  .easing(Easing.bezier(0.2, 0, 0, 1))
  .reduceMotion(ReduceMotion.System));

/** Staggered fade-in for short, non-virtualized lists and screen sections. */
export function enterItem(index = 0) {
  // Custom web entering keyframes restore an absolute snapshot after cleanup.
  // A built-in fade keeps sections in normal flow when the viewport changes.
  // A quiet fade only: sliding rows in from below read as the list jumping on every refresh.
  return unlessStill(FadeIn.duration(motion.reveal)
    .delay(Math.min(index, 8) * 20)
    .reduceMotion(ReduceMotion.System));
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
