import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useFeedbackAnimation } from "./use-feedback-animation";
import { useMobileTheme } from "./theme";

/** Desktop `project-row-working-pulse`: one fade of the band, then back, in ms. */
const PULSE = 2400;
/** Desktop `--ui-working-row-tint` (8%) and `--ui-working-row-sweep` (20%) as hex alpha. */
const TINT_ALPHA = "14";
const BAND_ALPHA = "33";

/** `#RRGGBB` with a hex alpha; other color forms fall back to the semantic surface. */
function withAlpha(color: string, alpha: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : fallback;
}

/**
 * Desktop's working-row decoration (`src/styles/working-row.css`): a soft live tint over the whole
 * row and a band of light across its middle that slowly fades in and out. Render it as the first
 * child of a row wrapper so the row's content draws above it. The tint stays under reduced motion
 * or while the screen is hidden; only the pulse stops. Decorative: the row's label carries the
 * running state.
 */
export function WorkingRowGlow() {
  const { colors, semanticColors } = useMobileTheme();
  const animate = useFeedbackAnimation();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!animate) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: PULSE, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [animate, pulse]);
  const bandStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const surface = semanticColors.info.surface;
  const band = withAlpha(colors.live, BAND_ALPHA, surface);
  return (
    <View accessible={false} pointerEvents="none" importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.live, TINT_ALPHA, surface) }]} />
      {animate ? (
        <Animated.View style={[StyleSheet.absoluteFill, bandStyle]}>
          <LinearGradient
            colors={[withAlpha(colors.live, "00", "transparent"), band, withAlpha(colors.live, "00", "transparent")]}
            locations={[0.3, 0.5, 0.7]}
            start={{ x: 0, y: 0.4 }}
            end={{ x: 1, y: 0.6 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
