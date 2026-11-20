import { useEffect, useId } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { ThinkingOrb, type ThinkingOrbState } from "panelui-native/components/thinking-orb";
import { useMobileTheme } from "@/ui/theme";
import { useReducedMotionPreference } from "@/ui/use-reduced-motion";
import { useRouteFocus } from "@/ui/use-route-focus";
import type { MobileColors } from "@/ui/tokens";
import type { AssistantOrbState } from "./assistant-voice-presentation";

/** Stage light per call state: listening is blue, thinking violet, speaking teal; muted and idle stay calm. */
function assistantStageTones(state: AssistantOrbState, colors: MobileColors) {
  if (state === "listening") return { primary: colors.voiceListen, glow: colors.voiceListenGlow, strength: 0.6 };
  if (state === "thinking") return { primary: colors.voiceThink, glow: colors.voiceThinkGlow, strength: 0.55 };
  if (state === "speaking") return { primary: colors.voiceSpeak, glow: colors.voiceSpeakGlow, strength: 0.6 };
  if (state === "error") return { primary: colors.danger, glow: colors.voiceThink, strength: 0.26 };
  if (state === "muted") return { primary: colors.tertiary, glow: colors.voiceListen, strength: 0.25 };
  return { primary: colors.voiceListen, glow: colors.voiceThink, strength: 0.32 };
}

/**
 * The PanelUI orb shape that says what the call is doing. Idle, muted and error hold the same still
 * sphere the assistant's home shows, so a stopped call reads as a pause rather than a new screen.
 */
export function assistantStageOrb(state: AssistantOrbState): { shape: ThinkingOrbState; paused: boolean; speed: number } {
  if (state === "listening") return { shape: "listening", paused: false, speed: 1 };
  if (state === "thinking") return { shape: "working", paused: false, speed: 1 };
  if (state === "speaking") return { shape: "composing", paused: false, speed: 1.15 };
  return { shape: "listening", paused: true, speed: 1 };
}

/** Smoothed microphone energy; speaking breathes on its own because playback has no meter. */
function useStageEnergy(state: AssistantOrbState, level: number) {
  const reducedMotion = useReducedMotionPreference();
  const focused = useRouteFocus();
  const reduced = reducedMotion || !focused;
  const energy = useSharedValue(0), breath = useSharedValue(0);
  const input = state === "listening" && Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  // The meter arrives as React state; ease each sample on the UI thread instead of re-rendering the stage.
  useEffect(() => {
    energy.value = withTiming(reduced ? 0 : input, { duration: 140, easing: Easing.out(Easing.quad) });
  }, [input, reduced, energy]);
  // Speaking and thinking own a slow breath; every other state, reduced motion and unmount stop it.
  useEffect(() => {
    cancelAnimation(breath);
    breath.value = 0;
    if (!reduced && (state === "speaking" || state === "thinking"))
      breath.value = withRepeat(withTiming(1, { duration: state === "speaking" ? 520 : 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breath);
  }, [state, reduced, breath]);
  return { energy, breath, reduced };
}

/**
 * The three pools share a viewport-sized drawing. Oversized, animated SVG views would each
 * allocate and composite a separate surface while the owner interacts with the screen.
 */
export function AssistantVoiceBackdrop({ state }: { state: AssistantOrbState }) {
  const { colors } = useMobileTheme(), { width, height } = useWindowDimensions();
  const gradient = useId().replace(/:/g, "");
  const tones = assistantStageTones(state, colors);
  const radius = Math.max(width, height) * 0.475;
  const pools = [
    { id: `${gradient}-main`, color: tones.primary, opacity: tones.strength, x: width * 0.2, y: height * 0.32, r: radius },
    { id: `${gradient}-side`, color: tones.glow, opacity: tones.strength * 0.8, x: width * 0.85, y: height * 0.62, r: radius * 0.85 },
    { id: `${gradient}-dock`, color: tones.primary, opacity: tones.strength * 0.6, x: width * 0.3, y: height * 0.98, r: radius * 0.8 },
  ];
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <Defs>{pools.map(({ id, color, opacity }) => (
        <RadialGradient key={id} id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.45" stopColor={color} stopOpacity={opacity * 0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      ))}</Defs>
      {pools.map(({ id, x, y, r }) => <Circle key={id} cx={x} cy={y} r={r} fill={`url(#${id})`} />)}
    </Svg>
  </View>;
}

/** The call's centrepiece: PanelUI's dotted orb at full size, over a halo that follows the voice. */
export function AssistantVoiceOrb({ state, level, size, label }: { state: AssistantOrbState; level: number; size: number; label: string }) {
  const { colors } = useMobileTheme();
  const { energy, breath, reduced } = useStageEnergy(state, level);
  const gradient = useId().replace(/:/g, "");
  const tones = assistantStageTones(state, colors), orb = assistantStageOrb(state);
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: 1 + energy.value * 0.14 + breath.value * (state === "speaking" ? 0.04 : 0.015) }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.55 + energy.value * 0.45 + breath.value * 0.2, transform: [{ scale: 1 + energy.value * 0.3 + breath.value * 0.06 }] }));
  return <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <Animated.View pointerEvents="none" style={[{ position: "absolute", width: size, height: size }, halo]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs><RadialGradient id={gradient} cx="50%" cy="50%" r="50%">
          <Stop offset="0.35" stopColor={tones.glow} stopOpacity={tones.strength * 0.6} />
          <Stop offset="0.7" stopColor={tones.primary} stopOpacity={tones.strength * 0.25} />
          <Stop offset="1" stopColor={tones.primary} stopOpacity={0} />
        </RadialGradient></Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#${gradient})`} />
      </Svg>
    </Animated.View>
    <Animated.View style={pulse}>
      <ThinkingOrb state={orb.shape} paused={reduced || orb.paused} speed={orb.speed} size={Math.round(size * 0.82)}
        color={state === "muted" ? colors.muted : state === "error" ? colors.danger : colors.text} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
    </Animated.View>
  </View>;
}
