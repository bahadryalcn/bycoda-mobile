import { useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeInDown, ReduceMotion, useSharedValue } from "react-native-reanimated";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OnboardingPager, PageDots, type OnboardingPage } from "./onboarding-pager";
import { DotField } from "./dot-field";
import { useMobileTheme } from "./theme";
import { metrics, space } from "./tokens";

/**
 * Full-screen first-run frame: swipeable pages with an optional `top` row, the caller's
 * actions fixed at the bottom. `pages` may be hidden (for example while a sign-in code is typed)
 * without remounting the actions.
 */
export function OnboardingShell({ pages, hidePages = false, top, children }: {
  pages: OnboardingPage[];
  hidePages?: boolean;
  top?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const offset = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const [topHeight, setTopHeight] = useState(0);
  const sideInsets = { paddingStart: Math.max(insets.left, space.screen), paddingEnd: Math.max(insets.right, space.screen) };
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
    <DotField offset={offset} pulse={index} />
    {!hidePages
      ? <Animated.View entering={FadeIn.duration(700).reduceMotion(ReduceMotion.System)} style={StyleSheet.absoluteFill}>
        <OnboardingPager pages={pages} index={index} offset={offset} onIndexChange={setIndex}
          top={topHeight + space.lg} bottomClearance={panelHeight + space.xl} />
      </Animated.View>
      : null}
    <Animated.View entering={FadeInDown.duration(600).delay(150).reduceMotion(ReduceMotion.System)}
      onLayout={({ nativeEvent }) => setTopHeight(nativeEvent.layout.height)}
      pointerEvents="box-none" style={{ paddingTop: insets.top + space.lg, ...sideInsets }}>
      {top}
    </Animated.View>
    <View pointerEvents="none" style={{ flex: 1 }} />
    <Animated.View
      entering={FadeInDown.duration(600).delay(300).reduceMotion(ReduceMotion.System)}
      onLayout={({ nativeEvent }) => setPanelHeight(nativeEvent.layout.height)}
      style={{ width: "100%", maxWidth: metrics.entryWidth, alignSelf: "center", gap: space.lg,
        paddingBottom: Math.max(insets.bottom, space.md), ...sideInsets }}
    >
      {!hidePages && pages.length > 1 ? <PageDots count={pages.length} index={index} offset={offset} width={width} /> : null}
      {children}
    </Animated.View>
  </KeyboardAvoidingView>;
}
