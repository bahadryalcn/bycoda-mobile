import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import MaskedViewNative from "@react-native-masked-view/masked-view";
import type { ComponentType, ReactElement } from "react";
import type { ImageSourcePropType, ViewProps } from "react-native";

// The package types its class from a React Native type that 0.88 removed; type it by its props.
const MaskedView = MaskedViewNative as unknown as ComponentType<ViewProps & { maskElement: ReactElement }>;
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useMobileTheme } from "./theme";

type Mask = { source: ImageSourcePropType; aspect: number };
/** Frames drawn by the website's rig; `sequence` lists frame indices played at `fps`, frame 0 is the rest pose. */
type Sprite = { frames: ImageSourcePropType[]; sequence: number[]; fps: number; aspect: number };

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/**
 * The website's figures. Masks are its dot-matrix voice face and code-glyph crew as white alpha, drawn in the active
 * palette's ink (light on a dark ground, dark on a light ground). Sprites are the pixel guide in
 * its own colours. Aspect is width / height.
 */
const figures = {
  serene: { source: require("../../assets/onboarding/art-face-serene.png"), aspect: 700 / 1229 },
  wave: { source: require("../../assets/onboarding/art-uncle-wave.png"), aspect: 303 / 794 },
  adult: { source: require("../../assets/onboarding/art-adult.png"), aspect: 291 / 704 },
  think: { source: require("../../assets/onboarding/art-think.png"), aspect: 279 / 788 },
  child: { source: require("../../assets/onboarding/art-child.png"), aspect: 238 / 490 },
  // Walks in place, one stride per second.
  guideWalk: {
    frames: [
      require("../../assets/onboarding/art-guide-walk-0.png"), require("../../assets/onboarding/art-guide-walk-1.png"),
      require("../../assets/onboarding/art-guide-walk-2.png"), require("../../assets/onboarding/art-guide-walk-3.png"),
      require("../../assets/onboarding/art-guide-walk-4.png"), require("../../assets/onboarding/art-guide-walk-5.png"),
      require("../../assets/onboarding/art-guide-walk-6.png"), require("../../assets/onboarding/art-guide-walk-7.png"),
    ],
    sequence: range(8), fps: 8, aspect: 945 / 1511,
  },
  // Lifts his hat, holds it, puts it back.
  guideTip: {
    frames: [
      require("../../assets/onboarding/art-guide-tip-0.png"), require("../../assets/onboarding/art-guide-tip-1.png"),
      require("../../assets/onboarding/art-guide-tip-2.png"), require("../../assets/onboarding/art-guide-tip-3.png"),
      require("../../assets/onboarding/art-guide-tip-4.png"),
    ],
    sequence: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 2, 1], fps: 8, aspect: 936 / 1664,
  },
  // Counts his prayer beads and glances aside.
  guideFront: {
    frames: [
      require("../../assets/onboarding/art-guide-front-0.png"), require("../../assets/onboarding/art-guide-front-1.png"),
      require("../../assets/onboarding/art-guide-front-2.png"), require("../../assets/onboarding/art-guide-front-3.png"),
      require("../../assets/onboarding/art-guide-front-4.png"), require("../../assets/onboarding/art-guide-front-5.png"),
      require("../../assets/onboarding/art-guide-front-6.png"), require("../../assets/onboarding/art-guide-front-7.png"),
      require("../../assets/onboarding/art-guide-front-8.png"), require("../../assets/onboarding/art-guide-front-9.png"),
      require("../../assets/onboarding/art-guide-front-10.png"), require("../../assets/onboarding/art-guide-front-11.png"),
    ],
    sequence: range(12), fps: 4, aspect: 902 / 1522,
  },
} satisfies Record<string, Mask | Sprite>;

export type CodeArtName = keyof typeof figures;

const isSprite = (figure: Mask | Sprite): figure is Sprite => "frames" in figure;

/** The largest width at which a figure fits inside a box; pixel sprites stay small enough to read as pixels. */
export function codeArtWidth(name: CodeArtName, box: { width: number; height: number }) {
  const figure: Mask | Sprite = figures[name];
  const height = isSprite(figure) ? box.height * 0.62 : box.height;
  return Math.max(0, Math.min(box.width, height * figure.aspect));
}

const COLUMNS = 12;
/** Fixed pseudo-random order, so every reveal dissolves the same way. */
const order = (index: number) => ((index * 7919) % 997) / 997;

/** One cover block; it clears when the reveal passes its threshold. */
function Block({ index, size, progress, color }: { index: number; size: number; progress: SharedValue<number>; color: string }) {
  const threshold = order(index) * 0.8;
  const style = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.max(0, (progress.value - threshold) / 0.2)) }));
  return <Animated.View style={[{ width: size, height: size, backgroundColor: color }, style]} />;
}

/** One stacked frame, shown while the clock is on a step that plays it; swapping opacity never reloads an image. */
function Frame({ source, frame, sequence, clock, width, height }: {
  source: ImageSourcePropType; frame: number; sequence: number[]; clock: SharedValue<number>; width: number; height: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: sequence[Math.min(sequence.length - 1, Math.floor(clock.value))] === frame ? 1 : 0,
  }));
  return <Animated.Image source={source} resizeMode="contain" style={[StyleSheet.absoluteFill, { width, height }, style]} />;
}

/**
 * Decorative website figure. While `active` it resolves through a pixel dissolve; a band of light
 * keeps travelling down the glyphs and the pixel guide plays his loop. Off-page and under reduced
 * motion it is still, the guide in his rest pose.
 */
export function CodeArt({ name, width, active }: { name: CodeArtName; width: number; active: boolean }) {
  const { colors } = useMobileTheme();
  const reduced = useReducedMotion();
  const figure: Mask | Sprite = figures[name];
  const sprite = isSprite(figure) ? figure : null;
  const mask = isSprite(figure) ? null : figure;
  const height = width / figure.aspect;
  const reveal = useSharedValue(reduced ? 1 : 0);
  const light = useSharedValue(0);
  const clock = useSharedValue(0);
  const steps = sprite?.sequence.length ?? 0;
  const stepMs = sprite ? 1000 / sprite.fps : 0;
  useEffect(() => {
    // Each activation replays the dissolve and restarts the light and the guide's loop; leaving the page covers it again.
    if (reduced) { reveal.value = 1; return; }
    if (!active) { cancelAnimation(light); cancelAnimation(clock); reveal.value = 0; clock.value = 0; return; }
    reveal.value = 0;
    reveal.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
    light.value = 0;
    light.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.quad) }), -1);
    clock.value = 0;
    if (steps) clock.value = withRepeat(withTiming(steps, { duration: steps * stepMs, easing: Easing.linear }), -1);
  }, [active, reduced, reveal, light, clock, steps, stepMs]);
  const band = useAnimatedStyle(() => ({ transform: [{ translateY: -height * 0.4 + light.value * height * 1.4 }] }));
  const size = Math.ceil(width / COLUMNS);
  const rows = Math.ceil(height / size);
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none"
      style={{ width, height, overflow: "hidden" }}>
      {sprite ? (
        // Only the visible page stacks every frame; the others hold one image in memory.
        active && !reduced
          ? sprite.frames.map((source, frame) => (
            <Frame key={frame} source={source} frame={frame} sequence={sprite.sequence} clock={clock} width={width} height={height} />
          ))
          : <Image source={sprite.frames[0]} resizeMode="contain" style={{ width, height }} />
      ) : mask ? (
        <MaskedView style={StyleSheet.absoluteFill}
          maskElement={<Image source={mask.source} resizeMode="contain" style={{ width, height }} />}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.text, opacity: reduced ? 0.95 : 0.78 }]} />
          {reduced ? null : (
            <Animated.View style={[{ position: "absolute", left: 0, right: 0, height: height * 0.4 }, band]}>
              <LinearGradient colors={[`${colors.text}00`, colors.text, `${colors.text}00`]} style={StyleSheet.absoluteFill} />
            </Animated.View>
          )}
        </MaskedView>
      ) : null}
      {reduced ? null : (
        <View style={[StyleSheet.absoluteFill, { flexDirection: "row", flexWrap: "wrap" }]}>
          {Array.from({ length: COLUMNS * rows }, (_, index) => (
            <Block key={index} index={index} size={size} progress={reveal} color={colors.background} />
          ))}
        </View>
      )}
    </View>
  );
}
