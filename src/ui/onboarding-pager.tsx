import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { Heading } from "./primitives";
import { CodeArt, codeArtWidth, type CodeArtName } from "./code-art";
import { useMobileTheme } from "./theme";
import { useCopy } from "./copy";
import { pageAtOffset } from "./onboarding-page-offset";
import { fontSize, lineHeight, radii, space } from "./tokens";

/**
 * `lightArt` replaces `art` on a light ground. As on the website, the dot-matrix face belongs to the
 * dark stage; light sections use the code-glyph crew in dark ink.
 */
export type OnboardingPage = { key: string; art: CodeArtName; lightArt?: CodeArtName; title: string };

/** A page's figure resolves when its page settles; figure and title drift at different speeds. */
function Slide({ page, position, offset, width, top, bottomClearance, active }: {
  page: OnboardingPage; position: number; offset: SharedValue<number>; width: number;
  top: number; bottomClearance: number; active: boolean;
}) {
  const { uiStyles, mode } = useMobileTheme();
  const figure = mode === "light" && page.lightArt ? page.lightArt : page.art;
  const [box, setBox] = useState({ width: 0, height: 0 });
  const range = [(position - 1) * width, position * width, (position + 1) * width];
  const art = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, range, [0.2, 1, 0.2], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(offset.value, range, [-width * 0.25, 0, width * 0.25], Extrapolation.CLAMP) }],
  }));
  const title = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(offset.value, range, [width * 0.35, 0, -width * 0.35], Extrapolation.CLAMP) }],
  }));
  return (
    <View style={{ width, paddingTop: top, paddingBottom: bottomClearance, paddingHorizontal: space.xl, gap: space.xl }}>
      <Animated.View style={[{ flex: 1, alignItems: "center", justifyContent: "center" }, art]}
        onLayout={({ nativeEvent }) => setBox({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}>
        {box.height > 0 ? <CodeArt name={figure} width={codeArtWidth(figure, box)} active={active} /> : null}
      </Animated.View>
      <Animated.View style={title}>
        <Heading style={[uiStyles.largeTitle, { textAlign: "center", fontSize: fontSize.display, lineHeight: lineHeight.display }]}>
          {page.title}
        </Heading>
      </Animated.View>
    </View>
  );
}

/**
 * Full-screen first-run pages: the website's code-glyph figures above one headline each. Figures
 * stay between `top` and the title; the title sits `bottomClearance` above the caller's fixed
 * actions. Never auto-advances. `offset` is shared with `PageDots`.
 */
export function OnboardingPager({ pages, index, offset, onIndexChange, top, bottomClearance }: {
  pages: OnboardingPage[];
  index: number;
  offset: SharedValue<number>;
  onIndexChange: (index: number) => void;
  top: number;
  bottomClearance: number;
}) {
  const [width, setWidth] = useState(0);
  const onScroll = useAnimatedScrollHandler((event) => { offset.value = event.contentOffset.x; });
  return (
    <View style={StyleSheet.absoluteFill} onLayout={({ nativeEvent }) => {
      if (nativeEvent.layout.width === width) return;
      setWidth(nativeEvent.layout.width);
      offset.value = 0;
      onIndexChange(0);
    }}>
      {width > 0 ? (
        <Animated.ScrollView
          // A new width (rotation, split view) remounts at the first page instead of between pages.
          key={width}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onMomentumScrollEnd={({ nativeEvent }) => onIndexChange(pageAtOffset(nativeEvent.contentOffset.x, width, pages.length))}
        >
          {pages.map((page, position) => (
            <Slide key={page.key} page={page} position={position} offset={offset} width={width} top={top}
              bottomClearance={bottomClearance} active={position === index} />
          ))}
        </Animated.ScrollView>
      ) : null}
    </View>
  );
}

function Dot({ position, offset, width }: { position: number; offset: SharedValue<number>; width: number }) {
  const { colors } = useMobileTheme();
  const style = useAnimatedStyle(() => {
    const range = [(position - 1) * width, position * width, (position + 1) * width];
    return {
      width: interpolate(offset.value, range, [6, 22, 6], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(offset.value, range, [colors.border, colors.text, colors.border]),
    };
  });
  return <Animated.View style={[{ height: 6, borderRadius: radii.pill }, style]} />;
}

/** Position indicator following the swipe; one accessible summary instead of unlabeled dots. */
export function PageDots({ count, index, offset, width }: {
  count: number; index: number; offset: SharedValue<number>; width: number;
}) {
  const copy = useCopy();
  return (
    <View
      accessible
      accessibilityLabel={copy("Sayfa {p0} / {p1}", "Page {p0} of {p1}", { p0: index + 1, p1: count })}
      style={{ flexDirection: "row", justifyContent: "center", gap: space.sm }}
    >
      {Array.from({ length: count }, (_, position) => (
        <Dot key={position} position={position} offset={offset} width={width} />
      ))}
    </View>
  );
}
