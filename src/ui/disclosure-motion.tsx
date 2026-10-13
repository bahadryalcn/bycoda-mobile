import { useEffect, useState, type PropsWithChildren } from "react";
import { View } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { motionTiming } from "./motion";
import { space } from "./tokens";

export function DisclosureChevron({
  expanded,
  color,
  size = 17,
  closedAngle = 0,
  openAngle = 90,
}: {
  expanded: boolean;
  color: string;
  size?: number;
  closedAngle?: number;
  openAngle?: number;
}) {
  const rotation = useSharedValue(expanded ? openAngle : closedAngle);
  useEffect(() => {
    rotation.value = withTiming(expanded ? openAngle : closedAngle, motionTiming);
  }, [expanded, rotation, closedAngle, openAngle]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  return (
    <Animated.View accessible={false} style={style}>
      <ChevronRight size={size} color={color} />
    </Animated.View>
  );
}

/** Retain measured content through collapse instead of unmounting it at the tap. */
export function DisclosureBody({ expanded, children }: PropsWithChildren<{ expanded: boolean }>) {
  const [height, setHeight] = useState(0);
  const [present, setPresent] = useState(expanded);
  const progress = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    if (expanded) setPresent(true);
    progress.value = withTiming(expanded ? 1 : 0, motionTiming, (finished) => {
      if (finished && !expanded) runOnJS(setPresent)(false);
    });
    return () => cancelAnimation(progress);
  }, [expanded, progress]);
  const style = useAnimatedStyle(() => ({
    height: height * progress.value,
    opacity: progress.value,
  }));
  return (
    <Animated.View
      style={[{ overflow: "hidden" }, style]}
      pointerEvents={expanded ? "auto" : "none"}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
    >
      <View
        onLayout={(event) => {
          if (present) setHeight(event.nativeEvent.layout.height);
        }}
        style={{
          position: "absolute",
          display: present ? "flex" : "none",
          width: "100%",
          gap: space.sm,
          paddingBottom: space.sm,
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
