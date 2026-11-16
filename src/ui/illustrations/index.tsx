import { Image } from "expo-image";
import { art } from "./art";

export type IllustrationName = keyof typeof art;
/** Every product state that has its own illustration. */
export const illustrationNames = Object.keys(art) as IllustrationName[];

/** Decorative art `size` points tall; the surrounding state title supplies the accessible meaning. */
export function Illustration({ name, size = 160 }: { name: IllustrationName; size?: number }) {
  const { source, aspect } = art[name];
  return (
    <Image source={source} contentFit="contain" accessible={false} accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" testID={`illustration-${name}`}
      style={{ height: size, width: Math.min(size * aspect, size * 1.4) }} />
  );
}
