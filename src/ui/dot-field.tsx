import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useMobileTheme } from "./theme";
import { useOwnerVisible } from "./use-owner-visible";
import { useReducedMotionPreference } from "./use-reduced-motion";

import { DOT_PHASES, DOT_SIZE as DOT, DOT_SPAN as SPAN, dotLayout, dotPhase, type Dot } from "./dot-field-layout";

const PARALLAX = 0.12;

/** One dot at its own level; it lights up as the ripple's ring passes it. Only the ripple re-runs it. */
function FieldDot({ dot, ripple, origin, reach, color }: {
  dot: Dot; ripple: SharedValue<number>; origin: { x: number; y: number }; reach: number; color: string;
}) {
  const distance = Math.hypot(dot.x - origin.x, dot.y - origin.y);
  const style = useAnimatedStyle(() => {
    const age = ripple.value;
    const wave = age < 1 ? Math.exp(-(((distance - age * reach) / 60) ** 2)) * (1 - age) : 0;
    const level = Math.min(1, dot.level + wave * 0.9);
    return { opacity: level, transform: [{ scale: 0.5 + 0.5 * Math.min(1, level * 1.6) }] };
  });
  return <Animated.View style={[{ position: "absolute", left: dot.x, top: dot.y, width: DOT, height: DOT, backgroundColor: color }, style]} />;
}

/** Every dot of one phase; the group's opacity carries the shared breath. */
function PhaseGroup({ phase, time, children }: { phase: number; time: SharedValue<number>; children: ReactNode }) {
  const offset = ((phase + 0.5) / DOT_PHASES) * Math.PI * 2;
  const style = useAnimatedStyle(() => ({ opacity: 0.8 + 0.2 * Math.sin(time.value * 2.2 + offset) }));
  return <Animated.View style={[StyleSheet.absoluteFill, style]}>{children}</Animated.View>;
}

/**
 * Full-screen backdrop from the website: a faint square-dot field that breathes, drifts against a
 * pager's `offset` and sends a ripple from the figure's centre whenever `pulse` changes. Reduced
 * motion keeps it still.
 */
export function DotField({ offset, pulse = 0 }: { offset?: SharedValue<number>; pulse?: number }) {
  const { colors } = useMobileTheme();
  const reduced = useReducedMotionPreference();
  // Under a pushed route, behind another window, the lock or in the background nobody sees the field breathe.
  const breathing = useOwnerVisible() && !reduced;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const time = useSharedValue(0);
  const ripple = useSharedValue(1);
  const still = useSharedValue(0);
  const drift = offset ?? still;
  useEffect(() => {
    // The breathing runs for as long as the field is on screen; a long linear loop keeps it seamless.
    if (!breathing) return;
    time.value = withRepeat(withTiming(Math.PI * 200, { duration: 1000 * 60 * 5, easing: Easing.linear }), -1);
    return () => cancelAnimation(time);
  }, [breathing, time]);
  useEffect(() => {
    // Every page change (and the first appearance) sends one ripple out from the figure.
    if (reduced) return;
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) });
  }, [pulse, reduced, ripple]);
  const shift = useAnimatedStyle(() => ({
    transform: [{ translateX: -((drift.value * PARALLAX) % (size.width * (SPAN - 1))) }],
  }));
  const dots = size.width ? dotLayout(size.width, size.height) : [];
  const origin = { x: size.width / 2, y: size.height * 0.4 };
  const reach = Math.hypot(size.width, size.height);
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent }) => setSize({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}>
      <Animated.View style={[StyleSheet.absoluteFill, shift]}>
        {Array.from({ length: DOT_PHASES }, (_, phase) => (
          <PhaseGroup key={phase} phase={phase} time={time}>
            {dots.map((dot, index) => dotPhase(dot.seed) === phase
              ? <FieldDot key={index} dot={dot} ripple={ripple} origin={origin} reach={reach} color={colors.text} />
              : null)}
          </PhaseGroup>
        ))}
      </Animated.View>
      {/* The field fades out behind the title and actions, so no dot sits between letters. */}
      <LinearGradient colors={[`${colors.background}00`, colors.background]} locations={[0, 0.7]}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "45%" }} />
    </View>
  );
}
