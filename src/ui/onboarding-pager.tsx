import { useState, type ComponentRef, type Ref } from "react";
import { StyleSheet, View, type ScrollView } from "react-native";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { Body, Heading, IconButton } from "./primitives";
import { CodeArt, codeArtWidth, type CodeArtName } from "./code-art";
import { useMobileTheme } from "./theme";
import { useCopy } from "./copy";
import { pageAtOffset } from "./onboarding-page-offset";
import { fontSize, lineHeight, metrics, radii, space } from "./tokens";

/**
 * `lightArt` replaces `art` on a light ground. As on the website, the dot-matrix face belongs to the
 * dark stage; light sections use the code-glyph crew in dark ink.
 */
export type OnboardingPage = { key: string; art: CodeArtName; lightArt?: CodeArtName; title: string; /** One short sentence under the title. */ body?: string };

const artHeight = 360;

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
    <View accessibilityElementsHidden={!active} importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={{ width, paddingTop: top, paddingBottom: bottomClearance, paddingHorizontal: space.xl, gap: space.xl, justifyContent: "center" }}>
      <Animated.View style={[{ flexBasis: artHeight, flexShrink: 1, alignItems: "center", justifyContent: "center" }, art]}
        onLayout={({ nativeEvent }) => setBox({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}>
        {box.height > 0 ? <CodeArt name={figure} width={codeArtWidth(figure, box)} active={active} /> : null}
      </Animated.View>
      <Animated.View style={[{ gap: space.sm }, title]}>
        <Heading style={[uiStyles.largeTitle, { textAlign: "center", fontSize: fontSize.display, lineHeight: lineHeight.display }]}>
          {page.title}
        </Heading>
        {page.body ? <Body muted style={{ textAlign: "center" }}>{page.body}</Body> : null}
      </Animated.View>
    </View>
  );
}

/**
 * Full-screen first-run pages: the website's code-glyph figures above one headline each. Figures
 * stay between `top` and the title; the title sits `bottomClearance` above the caller's fixed
 * actions. Never auto-advances. `offset` is shared with `PageDots`.
 */
export function OnboardingPager({ pages, index, offset, onIndexChange, top, bottomClearance, scrollRef }: {
  pages: OnboardingPage[];
  index: number;
  offset: SharedValue<number>;
  onIndexChange: (index: number) => void;
  top: number;
  bottomClearance: number;
  scrollRef: Ref<ComponentRef<typeof ScrollView>>;
}) {
  const [{ width, initialIndex }, setPageLayout] = useState({ width: 0, initialIndex: index });
  const onScroll = useAnimatedScrollHandler((event) => { offset.value = event.contentOffset.x; });
  return (
    <View style={StyleSheet.absoluteFill} onLayout={({ nativeEvent }) => {
      const nextWidth = nativeEvent.layout.width;
      if (nextWidth === width) return;
      setPageLayout({ width: nextWidth, initialIndex: index });
      offset.value = nextWidth * index;
    }}>
      {width > 0 ? (
        <Animated.ScrollView
          // Re-anchor the current page after rotation or split view changes the width.
          key={width}
          ref={scrollRef}
          contentOffset={{ x: width * initialIndex, y: 0 }}
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

/** Position indicator and swipe-free navigation, with one accessible summary for the dots. */
export function PageDots({ count, index, offset, width, onIndexChange }: {
  count: number; index: number; offset: SharedValue<number>; width: number; onIndexChange: (index: number) => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  return (
    <View style={{ minHeight: metrics.touchTarget, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.md }}>
      <IconButton label={copy("Önceki", "Previous")} disabled={index === 0} onPress={() => onIndexChange(index - 1)}>
        <ChevronLeft size={20} color={colors.text} />
      </IconButton>
      <View accessible accessibilityLabel={copy("Sayfa {p0} / {p1}", "Page {p0} of {p1}", { p0: index + 1, p1: count })}
        style={{ flexDirection: "row", gap: space.sm }}>
        {Array.from({ length: count }, (_, position) => (
          <Dot key={position} position={position} offset={offset} width={width} />
        ))}
      </View>
      <IconButton label={copy("Sonraki", "Next")} disabled={index === count - 1} onPress={() => onIndexChange(index + 1)}>
        <ChevronRight size={20} color={colors.text} />
      </IconButton>
    </View>
  );
}
