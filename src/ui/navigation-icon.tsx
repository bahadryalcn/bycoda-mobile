import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { motionTiming } from "./motion";
import { colors, radii } from "./tokens";

/** A quiet selection cue; the tab button owns the label and full touch area. */
export function NavigationIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  const progress = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, motionTiming);
  }, [focused, progress]);
  const indicator = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scaleX: 0.7 + progress.value * 0.3 }],
  }));
  return (
    <Animated.View
      accessible={false}
      style={{ width: 48, height: 30, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: 44,
            height: 28,
            borderRadius: radii.control,
            backgroundColor: colors.selected,
          },
          indicator,
        ]}
      />
      <View style={{ zIndex: 1 }}>{children}</View>
    </Animated.View>
  );
}
