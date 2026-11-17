import { useMobileTheme } from "@/ui/theme";
import { createContext, useCallback, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { View, type HostInstance, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { useKeyboardState, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "@/ui/tokens";
import { useAdaptiveLayout } from "@/ui/adaptive-layout";
import { tabletopFrameSplit } from "@/ui/fold-tabletop-model";

export const SessionKeyboardSpace = createContext<number | null>(null);

/**
 * Transcript above, composer below, in one column. The keyboard's native animation drives a single
 * bottom padding on the UI thread, so the composer rides the IME and the transcript viewport
 * shrinks with it without a JS frame or a measured composer height (no first-frame 0 -> N jump).
 */
export function SessionKeyboardFrame({
  children,
  composer,
  style,
}: PropsWithChildren<{ composer: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const { colors } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const { height, progress } = useReanimatedKeyboardAnimation();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const [frameHeight, setFrameHeight] = useState(0);
  const { tabletop } = useAdaptiveLayout();
  const frameRef = useRef<HostInstance>(null);
  const [frameTop, setFrameTop] = useState(0);
  const onFrameLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (Number.isFinite(next) && next > 0) setFrameHeight((previous) => (previous === next ? previous : next));
    // Window-space top, to place the transcript edge exactly on the hinge in tabletop posture.
    frameRef.current?.measureInWindow((_x, y) => { if (Number.isFinite(y)) setFrameTop((previous) => (previous === y ? previous : y)); });
  }, []);
  // The IME replaces the fold split while open.
  const split = tabletop && keyboardHeight === 0 ? tabletopFrameSplit(frameTop, frameHeight, tabletop) : null;
  const availableHeight = frameHeight > 0 ? Math.max(0, frameHeight - keyboardHeight) : null;
  const columnStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, -height.value) }));
  const safeBottomStyle = useAnimatedStyle(
    () => ({
      // The navigation inset is replaced by the IME while it is open.
      paddingBottom: insets.bottom * (1 - Math.min(1, Math.max(0, progress.value))),
    }),
    [insets.bottom],
  );
  const composerBlock = (
    <Animated.View style={[{ backgroundColor: colors.background, paddingTop: space.sm, paddingBottom: 0 }, safeBottomStyle]}>
      <SessionKeyboardSpace.Provider value={availableHeight}>
        <View style={{ paddingBottom: space.sm }}>{composer}</View>
      </SessionKeyboardSpace.Provider>
    </Animated.View>
  );
  return (
    <View ref={frameRef} onLayout={onFrameLayout} style={[{ flex: 1, minHeight: 0 }, style]}>
      <Animated.View style={[{ flex: 1, minHeight: 0 }, columnStyle]}>
        <View style={split ? { height: split.contentHeight, minHeight: 0 } : { flex: 1, minHeight: 0 }}>{children}</View>
        {split ? <View style={{ height: split.hingeHeight }} /> : null}
        {split ? <View style={{ flex: 1, minHeight: 0, justifyContent: "flex-end" }}>{composerBlock}</View> : composerBlock}
      </Animated.View>
    </View>
  );
}
