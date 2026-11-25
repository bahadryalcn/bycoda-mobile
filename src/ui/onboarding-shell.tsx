import { useRef, useState, type ComponentRef, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, ReduceMotion, useSharedValue } from "react-native-reanimated";
import { stillMotion } from "./motion";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OnboardingPager, PageDots, type OnboardingPage } from "./onboarding-pager";
import { DotField } from "./dot-field";
import { Body, Heading } from "./primitives";
import { useActionableToastClearance } from "./provider";
import { useMobileTheme } from "./theme";
import { metrics, space } from "./tokens";

/** Free height (dp at font scale 1) the figure and headline need above the panel; below it the pages give the room to the panel. */
const pagerMinRoom = 200;
/** More than the dots row, so showing the dots again cannot push the room back under the minimum. */
const compactExitMargin = metrics.touchTarget + space.lg;

/**
 * Full-screen first-run frame: swipeable pages with an optional `top` row, the caller's
 * actions fixed at the bottom. `pages` may be hidden (for example while a sign-in code is typed)
 * without remounting the actions. They also hide on their own when the screen is too short for
 * them and the panel together (landscape, large text, keyboard open). The offline tour can opt
 * into preserving the active page's text and controls in a scrollable panel on short screens.
 */
export function OnboardingShell({ pages, hidePages = false, compactPages = false, top, children }: {
  pages: OnboardingPage[];
  hidePages?: boolean;
  compactPages?: boolean;
  top?: ReactNode;
  children: ReactNode;
}) {
  const { colors } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const toastClearance = useActionableToastClearance();
  const { width, fontScale } = useWindowDimensions();
  // The action panel participates in layout and must be interactive as soon as it mounts.
  // Only the pager fades in, and it renders immediately when reduced motion is enabled.
  const still = stillMotion;
  const offset = useSharedValue(0);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [index, setIndex] = useState(0);
  // Room left between the top row and the panel; it already follows the keyboard, rotation and text size.
  const [freeHeight, setFreeHeight] = useState<number | null>(null);
  const [compact, setCompact] = useState(false);
  const minArtRoom = pagerMinRoom * Math.max(1, Number.isFinite(fontScale) ? fontScale : 1);
  // Enter below the minimum, leave only with the dots' height to spare, so hiding the dots cannot flip it back.
  if (freeHeight !== null) {
    if (!compact && freeHeight < minArtRoom) setCompact(true);
    else if (compact && freeHeight > minArtRoom + compactExitMargin) setCompact(false);
  }
  // An actionable notice and accessibility text compete for the same height as the sign-in panel.
  const useCompactPages = compact || (toastClearance > 0 && fontScale > 1);
  const showPages = !hidePages && !useCompactPages;
  const compactPage = !hidePages && useCompactPages && compactPages ? pages[index] : undefined;
  const goToPage = (page: number) => {
    if (page < 0 || page >= pages.length || (!scrollRef.current && !compactPage)) return;
    scrollRef.current?.scrollTo({ x: page * width, animated: false });
    offset.value = page * width;
    setIndex(page);
  };
  const pageControls = (showPages || compactPage) && pages.length > 1 ? (
    <PageDots count={pages.length} index={index} offset={offset} width={width} onIndexChange={goToPage} />
  ) : null;
  const sideInsets = { paddingStart: Math.max(insets.left, space.screen), paddingEnd: Math.max(insets.right, space.screen) };
  return <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
    <DotField offset={offset} pulse={index} />
    <View pointerEvents="box-none" style={{ paddingTop: insets.top + space.lg, ...sideInsets }}>
      {top}
    </View>
    <View pointerEvents="box-none" style={{ flex: 1, minHeight: 0 }} onLayout={({ nativeEvent }) => setFreeHeight(nativeEvent.layout.height)}>
      {showPages ? (
        <Animated.View entering={still ? undefined : FadeIn.duration(700).reduceMotion(ReduceMotion.System)} style={StyleSheet.absoluteFill}>
          <OnboardingPager pages={pages} index={index} offset={offset} onIndexChange={setIndex} scrollRef={scrollRef} />
        </Animated.View>
      ) : null}
    </View>
    <View
      // flexShrink: a tall panel gives way to the keyboard and short screens; a scrolling child inside it owns the overflow.
      style={{ width: "100%", maxWidth: metrics.entryWidth, alignSelf: "center", gap: space.lg, flexShrink: 1,
        paddingBottom: Math.max(insets.bottom + toastClearance, space.md), ...sideInsets }}
    >
      {compactPage ? (
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: space.sm }}>
          <View style={{ gap: space.xs }}>
            <Heading style={{ textAlign: "center" }}>{compactPage.title}</Heading>
            {compactPage.body ? <Body muted style={{ textAlign: "center" }}>{compactPage.body}</Body> : null}
          </View>
          {pageControls}
          {children}
        </ScrollView>
      ) : <>{pageControls}{children}</>}
    </View>
  </KeyboardAvoidingView>;
}
