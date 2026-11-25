import { useMobileTheme } from "@/ui/theme";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentRef, type PropsWithChildren, type ReactNode } from "react";
import { Platform, ScrollView, TextInput, View, type HostInstance, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { useKeyboardState, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "@/ui/tokens";
import { useAdaptiveLayout } from "@/ui/adaptive-layout";
import { tabletopFrameSplit } from "@/ui/fold-tabletop-model";

export const SessionKeyboardSpace = createContext<number | null>(null);

/** Receives the measured composer band height (safe-area bottom included while the IME is closed). */
export const SessionComposerHeight = createContext<((height: number) => void) | null>(null);

/**
 * Owns the measured composer height so a sibling overlay (the tablet quick panel) can clear it.
 * Height changes re-render only this provider, not the children element it was given.
 */
export function SessionComposerHeightProvider({
  children,
  fallback,
  overlay,
}: PropsWithChildren<{ fallback: number; overlay: (bottomInset: number) => ReactNode }>) {
  const [height, setHeight] = useState<number | null>(null);
  return (
    <SessionComposerHeight.Provider value={setHeight}>
      {children}
      {overlay(height ?? fallback)}
    </SessionComposerHeight.Provider>
  );
}

/**
 * Transcript above, composer below, in one column. The keyboard's native animation drives a single
 * bottom padding on the UI thread, so the composer rides the IME and the transcript viewport
 * shrinks with it without a JS frame or a measured composer height (no first-frame 0 -> N jump).
 */
export function SessionKeyboardFrame({
  children,
  composer,
  style,
  transparent = false,
}: PropsWithChildren<{
  composer: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Let a full-screen stage behind the frame show through the composer band (voice call). */
  transparent?: boolean;
}>) {
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
  const composerScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const composerViewport = useRef(0);
  const revealEditor = useCallback(() => {
    const viewport = composerViewport.current;
    if (!viewport) return;
    const scroll = composerScroll.current;
    const content = scroll?.getInnerViewRef();
    const editor = TextInput.State?.currentlyFocusedInput?.();
    if (!scroll || !content || !editor) return;
    editor.measureLayout(content, (_x, top, _width, editorHeight) => {
      if (composerViewport.current !== viewport || TextInput.State.currentlyFocusedInput() !== editor) return;
      const y = Math.max(0, Math.min(top, top + editorHeight - viewport));
      scroll.scrollTo({ y, animated: false });
    }, () => { /* The focused field belongs to a different scroll surface. */ });
  }, []);
  // Reveal after the keyboard state or measured viewport changes. Keep offset at zero when closed.
  useEffect(() => {
    if (keyboardHeight > 0) revealEditor();
    else {
      composerViewport.current = 0;
      composerScroll.current?.scrollTo({ y: 0, animated: false });
    }
  }, [keyboardHeight, revealEditor]);
  const columnStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, -height.value) }));
  const safeBottomStyle = useAnimatedStyle(
    () => ({
      // The navigation inset is replaced by the IME while it is open.
      paddingBottom: insets.bottom * (1 - Math.min(1, Math.max(0, progress.value))),
    }),
    Platform.OS === "web" ? [insets.bottom] : undefined,
  );
  const reportComposerHeight = useContext(SessionComposerHeight);
  const composerBlock = (
    <Animated.View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.height;
        if (Number.isFinite(next) && next > 0) reportComposerHeight?.(next);
      }}
      style={[
        {
          backgroundColor: transparent ? "transparent" : colors.background,
          flexShrink: 1,
          minHeight: 0,
          paddingTop: space.sm,
          maxHeight: keyboardHeight > 0 ? availableHeight ?? undefined : undefined,
        },
        safeBottomStyle,
      ]}
    >
      <SessionKeyboardSpace.Provider value={availableHeight}>
        <ScrollView
          ref={composerScroll}
          style={{ flexGrow: 0, flexShrink: 1 }}
          contentContainerStyle={{ paddingBottom: space.sm }}
          scrollEnabled={keyboardHeight > 0}
          scrollsToTop={false}
          keyboardDismissMode="none"
          keyboardShouldPersistTaps="always"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustKeyboardInsets={false}
          onLayout={({ nativeEvent: { layout } }) => {
            composerViewport.current = layout.height;
            if (keyboardHeight > 0) revealEditor();
          }}
        >
          {composer}
        </ScrollView>
      </SessionKeyboardSpace.Provider>
    </Animated.View>
  );
  return (
    <View ref={frameRef} onLayout={onFrameLayout} style={[{ flex: 1, minHeight: 0 }, style]}>
      <Animated.View style={[{ flex: 1, minHeight: 0 }, columnStyle]}>
        <View style={split ? { height: split.contentHeight, minHeight: 0 } : { flex: 1, minHeight: 0 }}>{children}</View>
        <View style={{ height: split?.hingeHeight ?? 0 }} />
        <View style={split ? { flex: 1, minHeight: 0, justifyContent: "flex-end" } : { flexShrink: 1, minHeight: 0 }}>
          {composerBlock}
        </View>
      </Animated.View>
    </View>
  );
}
