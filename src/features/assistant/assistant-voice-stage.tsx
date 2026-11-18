import { useEffect, useId } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { ThinkingOrb, type ThinkingOrbState } from "panelui-native/components/thinking-orb";
import { useMobileTheme } from "@/ui/theme";
import { useReducedMotionPreference } from "@/ui/use-reduced-motion";
import type { MobileColors } from "@/ui/tokens";
import type { AssistantOrbState } from "./assistant-voice-presentation";

/** Stage light per call state: listening is blue, thinking violet, speaking teal; muted and idle stay calm. */
export function assistantStageTones(state: AssistantOrbState, colors: MobileColors): { key: string; primary: string; glow: string; strength: number } {
  if (state === "listening") return { key: state, primary: colors.voiceListen, glow: colors.voiceListenGlow, strength: 0.6 };
  if (state === "thinking") return { key: state, primary: colors.voiceThink, glow: colors.voiceThinkGlow, strength: 0.55 };
  if (state === "speaking") return { key: state, primary: colors.voiceSpeak, glow: colors.voiceSpeakGlow, strength: 0.6 };
  if (state === "error") return { key: state, primary: colors.danger, glow: colors.voiceThink, strength: 0.26 };
  if (state === "muted") return { key: state, primary: colors.tertiary, glow: colors.voiceListen, strength: 0.25 };
  return { key: state, primary: colors.voiceListen, glow: colors.voiceThink, strength: 0.32 };
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
  const reduced = useReducedMotionPreference();
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

function Glow({ color, strength, size, left, top, energy, breath, drift, period }: {
  color: string; strength: number; size: number; left: number; top: number;
  energy: SharedValue<number>; breath: SharedValue<number>; drift: SharedValue<number>; period: number;
}) {
  const gradient = useId().replace(/:/g, "");
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.sin(drift.value * Math.PI * 2 / period) * size * 0.08 },
      { translateY: Math.cos(drift.value * Math.PI * 2 / (period * 1.3)) * size * 0.06 },
      { scale: 1 + Math.max(energy.value, breath.value * 0.35) * 0.35 },
    ],
  }));
  return <Animated.View style={[{ position: "absolute", left: left - size / 2, top: top - size / 2, width: size, height: size }, style]}>
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs><RadialGradient id={gradient} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={color} stopOpacity={strength} />
        <Stop offset="0.45" stopColor={color} stopOpacity={strength * 0.45} />
        <Stop offset="1" stopColor={color} stopOpacity={0} />
      </RadialGradient></Defs>
      <Circle cx="50" cy="50" r="50" fill={`url(#${gradient})`} />
    </Svg>
  </Animated.View>;
}

/**
 * Full-bleed call backdrop: two soft light pools in the state's colours that drift slowly, swell with
 * the owner's voice and cross-fade when the call changes state. Decorative and hidden from assistive tech.
 */
export function AssistantVoiceBackdrop({ state, level }: { state: AssistantOrbState; level: number }) {
  const { colors } = useMobileTheme(), viewport = useWindowDimensions();
  const { energy, breath, reduced } = useStageEnergy(state, level);
  const drift = useSharedValue(0);
  // One endless clock drives every pool's drift; reduced motion keeps them still.
  useEffect(() => {
    cancelAnimation(drift);
    // Ping-pong keeps the drift continuous; a restarting clock would jump every lap.
    if (!reduced) drift.value = withRepeat(withTiming(60, { duration: 60000, easing: Easing.linear }), -1, true);
    return () => cancelAnimation(drift);
  }, [reduced, drift]);
  const tones = assistantStageTones(state, colors);
  const size = Math.max(viewport.width, viewport.height) * 0.95;
  return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, overflow: "hidden" }]}>
    <Animated.View key={tones.key} entering={reduced ? undefined : FadeIn.duration(700)} exiting={reduced ? undefined : FadeOut.duration(700)} style={StyleSheet.absoluteFill}>
      <Glow color={tones.primary} strength={tones.strength} size={size} left={viewport.width * 0.2} top={viewport.height * 0.32} energy={energy} breath={breath} drift={drift} period={9} />
      <Glow color={tones.glow} strength={tones.strength * 0.8} size={size * 0.85} left={viewport.width * 0.85} top={viewport.height * 0.62} energy={energy} breath={breath} drift={drift} period={13} />
    </Animated.View>
  </View>;
}

/** The call's centrepiece: PanelUI's dotted orb at full size, over a halo that follows the voice. */
export function AssistantVoiceOrb({ state, level, size, label }: { state: AssistantOrbState; level: number; size: number; label: string }) {
  const { colors } = useMobileTheme();
  const { energy, breath } = useStageEnergy(state, level);
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
      <ThinkingOrb state={orb.shape} paused={orb.paused} speed={orb.speed} size={Math.round(size * 0.82)}
        color={state === "muted" ? colors.muted : state === "error" ? colors.danger : colors.text} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
    </Animated.View>
  </View>;
}
