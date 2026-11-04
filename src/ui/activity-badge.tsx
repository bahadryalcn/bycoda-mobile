import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Body } from "./typography";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { colors, radii, space } from "./tokens";
import { uiStyles } from "./styles";

/** Activity is separate from project identity; static text remains with reduced motion. */
export function ActivityBadge({ count }: { count?: number }) {
  useMobileTheme();
  const copy = useCopy();
  const [active, setActive] = useState(AppState.currentState === "active");
  const opacity = useSharedValue(1);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    opacity.value = active
      ? withRepeat(withTiming(0.35, { duration: 850, reduceMotion: ReduceMotion.System }), -1, true, undefined, ReduceMotion.System)
      : 1;
    return () => { cancelAnimation(opacity); opacity.value = 1; };
  }, [active, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const label = `${count === undefined ? "" : `${count} · `}${copy("Çalışıyor", "Running")}`;
  return <View accessible accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", minWidth: 0, maxWidth: "100%", flexShrink: 1, gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radii.control, backgroundColor: colors.panel }}>
    <Animated.View accessible={false} style={[{ width: 7, height: 7, borderRadius: radii.pill, backgroundColor: colors.live }, animated]} />
    <Body style={[uiStyles.caption, { color: colors.live }]}>{label}</Body>
  </View>;
}
