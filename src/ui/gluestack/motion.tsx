import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { motion } from "../tokens";

const Presence = createContext(true);
/** Keep the exiting child mounted. Core owns overlay visibility and focus restoration. */
export const AnimatePresence = React.forwardRef<View, { children?: React.ReactNode }>(
  function AnimatePresence({ children }, _ref) {
    const present = React.Children.count(children) > 0;
    const last = useRef(children);
    const [retained, setRetained] = useState(present);
    const reduced = useReducedMotion();
    if (present) last.current = children;
    useEffect(() => {
      if (present) {
        setRetained(true);
        return;
      }
      const timer = setTimeout(() => setRetained(false), reduced ? 0 : motion.sheet);
      return () => clearTimeout(timer);
    }, [present, reduced]);
    return (
      <Presence.Provider value={present}>
        {present ? children : retained ? last.current : null}
      </Presence.Provider>
    );
  },
);

type Pose = { x?: number; y?: number; opacity?: number; scale?: number };
export type MotionComponentProps<
  _Component = unknown,
  _Style = unknown,
  _A = unknown,
  _B = unknown,
  _C = unknown,
> = {
  initial?: Pose;
  animate?: Pose;
  exit?: Pose;
  transition?: { type?: string; duration?: number; delay?: number };
};
const pose = (value?: Pose) => ({
  x: value?.x ?? 0,
  y: value?.y ?? 0,
  opacity: value?.opacity ?? 1,
  scale: value?.scale ?? 1,
});

function createMotionAnimatedComponent<P extends { style?: unknown }>(
  Component: React.ComponentType<P>,
) {
  const Leaf = Animated.createAnimatedComponent(Component);
  return React.forwardRef<View, P & MotionComponentProps & { className?: string }>(
    function MotionLeaf({ initial, animate, exit, transition, style, ...props }, ref) {
      const present = useContext(Presence);
      const target = present ? animate : exit;
      const value = useSharedValue(pose(initial));
      const { x = 0, y = 0, opacity = 1, scale = 1 } = target ?? {};
      useEffect(() => {
        value.value = withTiming(
          { x, y, opacity, scale },
          { duration: transition?.duration ?? motion.reveal, reduceMotion: ReduceMotion.System },
        );
      }, [x, y, opacity, scale, transition?.duration, value]);
      const animated = useAnimatedStyle(() => ({
        opacity: value.value.opacity,
        transform: [
          { translateX: value.value.x },
          { translateY: value.value.y },
          { scale: value.value.scale },
        ],
      }));
      // Native animated leaf retains its component-specific props and ref.
      const leafProps = {
        ...props,
        ref,
        style: [style as ViewStyle, animated],
      } as React.ComponentProps<typeof Leaf>;
      return <Leaf {...leafProps} />;
    },
  );
}
const Motion = {
  View: createMotionAnimatedComponent(View),
  Pressable: createMotionAnimatedComponent(Pressable),
};
export { Motion, createMotionAnimatedComponent };
