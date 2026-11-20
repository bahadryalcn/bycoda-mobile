import { useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeInDown, ReduceMotion, useSharedValue } from "react-native-reanimated";
import { stillMotion } from "./motion";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OnboardingPager, PageDots, type OnboardingPage } from "./onboarding-pager";
import { DotField } from "./dot-field";
import { useMobileTheme } from "./theme";
import { metrics, space } from "./tokens";

/** Free height (dp at font scale 1) the figure and headline need above the panel; below it the pages give the room to the panel. */
const pagerMinRoom = 200;
/** More than the dots row, so showing the dots again cannot push the room back under the minimum. */
const compactExitMargin = 48;

/**
 * Full-screen first-run frame: swipeable pages with an optional `top` row, the caller's
 * actions fixed at the bottom. `pages` may be hidden (for example while a sign-in code is typed)
 * without remounting the actions. They also hide on their own when the screen is too short for
 * them and the panel together (landscape, large text, keyboard open); the panel then takes the
 * height and scrolls its own overflow.
 */
export function OnboardingShell({ pages, hidePages = false, top, children }: {
  pages: OnboardingPage[];
  hidePages?: boolean;
  top?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  // With Android "Remove animations" a delayed entering animation never ran and left the sign-in panel
  // invisible, so the first screen had no way in. Reduced motion mounts the views without one.
  const still = stillMotion;
  const offset = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const [topHeight, setTopHeight] = useState(0);
  // Room left between the top row and the panel; it already follows the keyboard, rotation and text size.
  const [freeHeight, setFreeHeight] = useState<number | null>(null);
  const [compact, setCompact] = useState(false);
  const minArtRoom = pagerMinRoom * Math.max(1, Number.isFinite(fontScale) ? fontScale : 1);
  // Enter below the minimum, leave only with the dots' height to spare, so hiding the dots cannot flip it back.
  if (freeHeight !== null) {
    if (!compact && freeHeight < minArtRoom) setCompact(true);
    else if (compact && freeHeight > minArtRoom + compactExitMargin) setCompact(false);
  }
  const showPages = !hidePages && !compact;
  const sideInsets = { paddingStart: Math.max(insets.left, space.screen), paddingEnd: Math.max(insets.right, space.screen) };
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
    <DotField offset={offset} pulse={index} />
    {showPages
      ? <Animated.View entering={still ? undefined : FadeIn.duration(700).reduceMotion(ReduceMotion.System)} style={StyleSheet.absoluteFill}>
        <OnboardingPager pages={pages} index={index} offset={offset} onIndexChange={setIndex}
          top={topHeight + space.lg} bottomClearance={panelHeight + space.xl} />
      </Animated.View>
      : null}
    <Animated.View entering={still ? undefined : FadeInDown.duration(600).delay(150).reduceMotion(ReduceMotion.System)}
      onLayout={({ nativeEvent }) => setTopHeight(nativeEvent.layout.height)}
      pointerEvents="box-none" style={{ paddingTop: insets.top + space.lg, ...sideInsets }}>
      {top}
    </Animated.View>
    <View pointerEvents="none" style={{ flex: 1 }} onLayout={({ nativeEvent }) => setFreeHeight(nativeEvent.layout.height)} />
    <Animated.View
      entering={still ? undefined : FadeInDown.duration(600).delay(300).reduceMotion(ReduceMotion.System)}
      onLayout={({ nativeEvent }) => setPanelHeight(nativeEvent.layout.height)}
      // flexShrink: a tall panel gives way to the keyboard and short screens; a scrolling child inside it owns the overflow.
      style={{ width: "100%", maxWidth: metrics.entryWidth, alignSelf: "center", gap: space.lg, flexShrink: 1,
        paddingBottom: Math.max(insets.bottom, space.md), ...sideInsets }}
    >
      {showPages && pages.length > 1 ?<PageDots count={pages.length} index={index} offset={offset} width={width} /> : null}
      {children}
    </Animated.View>
  </KeyboardAvoidingView>;
}
