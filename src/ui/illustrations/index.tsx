import { Image } from "expo-image";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { SpriteFrames, useSpriteFrame } from "../sprite-player";
import { art } from "./art";

type ArtName = keyof typeof art;
/** The app lock's hero is the one scene that is not a product state. */
export type IllustrationName = Exclude<ArtName, "lock-hero">;
/** Every product state that has its own illustration. */
export const illustrationNames = Object.keys(art).filter((name): name is IllustrationName => name !== "lock-hero");

/**
 * Decorative art `size` points tall; the surrounding state title supplies the accessible meaning. The pixel guide
 * plays his loop while mounted and rests on frame 0 under reduced motion, so only a playing scene stacks its frames.
 */
export function Illustration({ name, size = 160 }: { name: ArtName; size?: number }) {
  const { frames, sequence, fps, aspect } = art[name];
  const reduced = useReducedMotion();
  const current = useSpriteFrame({ sequence, fps }, !reduced);
  const width = Math.min(size * aspect, size * 1.4);
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      pointerEvents="none" testID={`illustration-${name}`} style={{ height: size, width }}>
      {reduced
        ? <Image source={frames[0]} contentFit="contain" style={{ height: size, width }} />
        : <SpriteFrames frames={frames} current={current} width={width} height={size} />}
    </View>
  );
}
