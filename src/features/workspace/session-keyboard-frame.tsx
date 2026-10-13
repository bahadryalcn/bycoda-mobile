import {
  createContext,
  useCallback,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import {
  KeyboardStickyView,
  useKeyboardState,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, space } from "@/ui/tokens";

export const SessionKeyboardSpace = createContext<number | null>(null);

/** Pin the composer to the IME itself; its measured footprint belongs to the viewport once. */
export function SessionKeyboardFrame({
  children,
  composer,
  style,
}: PropsWithChildren<{ composer: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const insets = useSafeAreaInsets();
  const { height, progress } = useReanimatedKeyboardAnimation();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const [frameHeight, setFrameHeight] = useState(0);
  const onFrameLayout = useCallback((event: LayoutChangeEvent) => {
    setFrameHeight(event.nativeEvent.layout.height);
  }, []);
  const availableHeight = frameHeight > 0 ? Math.max(0, frameHeight - keyboardHeight) : null;
  const composerHeight = useSharedValue(0);
  const onComposerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      composerHeight.value = event.nativeEvent.layout.height;
    },
    [composerHeight],
  );
  const viewportStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, -height.value) + composerHeight.value,
  }));
  const safeBottomStyle = useAnimatedStyle(
    () => ({
      // Composer already owns its compact 8dp footer. The navigation inset disappears with the IME.
      paddingBottom:
        Math.max(0, insets.bottom - space.sm) * (1 - Math.min(1, Math.max(0, progress.value))),
    }),
    [insets.bottom],
  );

  return (
    <View onLayout={onFrameLayout} style={[{ flex: 1, minHeight: 0 }, style]}>
      <Animated.View style={[{ flex: 1, minHeight: 0 }, viewportStyle]}>{children}</Animated.View>
      <KeyboardStickyView
        onLayout={onComposerLayout}
        style={{
          position: "absolute",
          left: Math.max(insets.left, space.screen),
          right: Math.max(insets.right, space.screen),
          bottom: 0,
          zIndex: 1,
        }}
      >
        <Animated.View style={[{ backgroundColor: colors.background }, safeBottomStyle]}>
          <SessionKeyboardSpace.Provider value={availableHeight}>
            {composer}
          </SessionKeyboardSpace.Provider>
        </Animated.View>
      </KeyboardStickyView>
    </View>
  );
}
