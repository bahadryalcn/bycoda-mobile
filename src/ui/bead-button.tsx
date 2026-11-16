import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Body } from "./typography";
import { useMobileTheme } from "./theme";
import { radii, space } from "./tokens";

const mark = require("../../../public/brand/bycoda/mark-white.png");

const BEADS = 12;
const SIZE = 104;
const BEAD = 9;

/** One bead; the counted one is lit and the two before it fade out, like a finger moving along the string. */
function Bead({ index, count, color }: { index: number; count: SharedValue<number>; color: string }) {
  const angle = (index / BEADS) * Math.PI * 2 - Math.PI / 2;
  const radius = SIZE / 2 - BEAD / 2;
  const style = useAnimatedStyle(() => {
    const behind = (((Math.floor(count.value) - index) % BEADS) + BEADS) % BEADS;
    return { opacity: behind === 0 ? 1 : behind === 1 ? 0.7 : behind === 2 ? 0.5 : 0.32 };
  });
  return <Animated.View style={[{
    position: "absolute", width: BEAD, height: BEAD, backgroundColor: color,
    left: SIZE / 2 + Math.cos(angle) * radius - BEAD / 2, top: SIZE / 2 + Math.sin(angle) * radius - BEAD / 2,
  }, style]} />;
}

/**
 * bycoda's own primary action for brand moments (unlock): the product mark inside a ring of the
 * guide's amber prayer beads. The beads count slowly while it waits and quickly while `busy`;
 * reduced motion keeps them still. The label below is the accessible name.
 */
export function BeadButton({ label, onPress, busy = false }: { label: string; onPress: () => void; busy?: boolean }) {
  const { colors } = useMobileTheme();
  const reduced = useReducedMotion();
  const count = useSharedValue(0);
  const press = useSharedValue(1);
  useEffect(() => {
    // Counting is the button's idle life; busy speeds it up so the wait reads as work.
    if (reduced) { cancelAnimation(count); count.value = 0; return; }
    const lap = busy ? 1200 : 6000;
    count.value = count.value % BEADS;
    count.value = withRepeat(withTiming(count.value + BEADS, { duration: lap, easing: Easing.linear }), -1);
    return () => cancelAnimation(count);
  }, [busy, reduced, count]);
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy, disabled: busy }}
      disabled={busy} onPress={onPress} hitSlop={space.md}
      onPressIn={() => { press.value = withSpring(0.93, { damping: 18, stiffness: 320 }); }}
      onPressOut={() => { press.value = withSpring(1, { damping: 14, stiffness: 260 }); }}
      style={{ alignItems: "center", gap: space.md }}>
      <Animated.View style={[{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }, scale]}>
        {Array.from({ length: BEADS }, (_, index) => <Bead key={index} index={index} count={count} color={colors.beads} />)}
        <View style={{ width: SIZE - BEAD * 4, height: SIZE - BEAD * 4, borderRadius: radii.pill, backgroundColor: colors.raised,
          borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
          <Image source={mark} tintColor={colors.brand} contentFit="contain" accessible={false} style={{ width: 40, height: 40 }} />
        </View>
      </Animated.View>
      <Body style={{ fontWeight: "600", color: colors.text }}>{label}</Body>
    </Pressable>
  );
}
