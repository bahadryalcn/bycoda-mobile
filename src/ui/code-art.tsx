import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import type { ImageSourcePropType } from "react-native";
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
import { SpriteFrames, range, useSpriteFrame, type SpriteLoop } from "./sprite-player";
import { useOwnerVisible } from "./use-owner-visible";

type Mask = { source: ImageSourcePropType; aspect: number };
/** Frames drawn by the website's rig, played by the shared sprite player. */
type Sprite = SpriteLoop & { aspect: number };

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
  const current = useSpriteFrame(sprite, active && !reduced);
  // A pushed screen, the lock or the background pause the light without covering the figure again.
  const visible = useOwnerVisible();
  const shining = active && visible;
  useEffect(() => {
    // Each activation replays the dissolve and the guide's loop; leaving the page covers it again.
    if (reduced) { reveal.value = 1; return; }
    if (!active) { reveal.value = 0; return; }
    reveal.value = 0;
    reveal.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [active, reduced, reveal]);
  useEffect(() => {
    if (reduced || !shining) { cancelAnimation(light); return; }
    light.value = 0;
    light.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.quad) }), -1);
    return () => cancelAnimation(light);
  }, [shining, reduced, light]);
  const band = useAnimatedStyle(() => ({ transform: [{ translateY: -height * 0.4 + light.value * height * 1.4 }] }));
  // Counter-moves the band's copy so the art inside the moving window stays aligned with the figure.
  const bandArt = useAnimatedStyle(() => ({ transform: [{ translateY: height * 0.4 - light.value * height * 1.4 }] }));
  const size = Math.ceil(width / COLUMNS);
  const rows = Math.ceil(height / size);
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none"
      style={{ width, height, overflow: "hidden" }}>
      {sprite ? (
        // Only the visible page stacks every frame; the others hold one image in memory.
        active && !reduced
          ? <SpriteFrames frames={sprite.frames} current={current} width={width} height={height} />
          : <Image source={sprite.frames[0]} resizeMode="contain" style={{ width, height }} />
      ) : mask ? (
        // The art is white alpha, so tinting draws it in the palette ink; a masked view rendered nothing on Android.
        <>
          <Image source={mask.source} resizeMode="contain" tintColor={colors.text}
            style={{ width, height, opacity: reduced ? 0.95 : 0.78 }} />
          {reduced ? null : (
            // The band is a clipped window that moves down while its full-strength copy of the art stays put.
            <Animated.View style={[{ position: "absolute", left: 0, right: 0, top: 0, height: height * 0.4, overflow: "hidden" }, band]}>
              <Animated.Image source={mask.source} resizeMode="contain" tintColor={colors.text}
                style={[{ position: "absolute", left: 0, top: 0, width, height }, bandArt]} />
            </Animated.View>
          )}
        </>
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
