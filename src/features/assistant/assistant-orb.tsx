import { useEffect, useId } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from "react-native-svg";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useMobileTheme } from "@/ui/theme";
import { useReducedMotionPreference } from "@/ui/use-reduced-motion";
import { AssistantAvatar } from "./assistant-avatar";
import type { AssistantOrbState } from "./assistant-voice-presentation";

/** Desktop VoiceCore geometry: rotating arcs, measured spectrum and a persona at its heart. */
export function AssistantOrb({ state, level = 0, size = 248, avatar }: { state: AssistantOrbState; level?: number; size?: number; avatar?: string }) {
  const { colors } = useMobileTheme(), reduced = useReducedMotionPreference();
  const gradient = useId().replace(/:/g, "");
  const turn = useSharedValue(0), breath = useSharedValue(0);
  const moving = state === "thinking" || state === "listening" || state === "speaking";
  // State owns decorative motion; mute/error, OS reduced motion and unmount stop both loops.
  useEffect(() => {
    cancelAnimation(turn); cancelAnimation(breath);
    turn.value = 0; breath.value = 0;
    if (!reduced && moving) {
      turn.value = withRepeat(withTiming(360, { duration: state === "thinking" ? 2400 : 18000, easing: Easing.linear }), -1, false);
      breath.value = withRepeat(withTiming(1, { duration: state === "speaking" ? 550 : 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
    return () => { cancelAnimation(turn); cancelAnimation(breath); };
  }, [moving, reduced, state, turn, breath]);
  const input = state === "listening" && Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  const rotation = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: 1 + (reduced ? 0 : breath.value * (state === "speaking" ? 0.055 : 0.018)) + input * 0.12 }] }));
  const tint = state === "error" ? colors.danger : state === "muted" ? colors.muted : colors.accent;
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <Animated.View style={[{ position: "absolute", width: size, height: size }, rotation]}>
      <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
        <Circle cx="50" cy="50" r="46" stroke={tint} strokeWidth="0.35" opacity={0.18} />
        <Path d={state === "error" ? "M60 12A40 40 0 0 1 70 85M40 88A40 40 0 0 1 30 15" : "M50 10A40 40 0 0 1 89.4 43M50 90A40 40 0 0 1 19.4 75.7"} stroke={tint} strokeWidth="1" strokeLinecap="round" opacity={state === "thinking" ? 0.9 : 0.45} />
        <Circle cx="50" cy="50" r="34" stroke={tint} strokeWidth="0.6" strokeDasharray="0.5 3.5" opacity={0.3} />
      </Svg>
    </Animated.View>
    <Animated.View style={[{ width: size, height: size }, pulse]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs><RadialGradient id={gradient} cx="35%" cy="28%" r="75%">
          <Stop offset="0" stopColor={colors.raised} />
          <Stop offset="0.32" stopColor={tint} stopOpacity={0.55} />
          <Stop offset="1" stopColor={tint} />
        </RadialGradient></Defs>
        {Array.from({ length: 40 }, (_, index) => {
          const angle = index / 40 * Math.PI * 2;
          const reach = 27 + input * (3 + Math.abs(Math.sin(index * 0.5)) * 4);
          return <Line key={index} x1={50 + Math.sin(angle) * 25} y1={50 - Math.cos(angle) * 25} x2={50 + Math.sin(angle) * reach} y2={50 - Math.cos(angle) * reach} stroke={tint} strokeWidth="0.7" opacity={0.3 + input * 0.6} strokeLinecap="round" />;
        })}
        <Circle cx="50" cy="50" r="22" fill={`url(#${gradient})`} opacity={state === "muted" || state === "idle" ? 0.55 : 1} />
      </Svg>
    </Animated.View>
    {avatar ? <View style={{ position: "absolute" }}><AssistantAvatar value={avatar} size={size * 0.4} /></View> : null}
  </View>;
}
