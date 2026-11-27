import { useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import type { ImageSourcePropType } from "react-native";
import { useOwnerVisible } from "./use-owner-visible";

/** Hand-drawn frames; `sequence` lists the frame indices played at `fps`, and frame 0 is the rest pose. */
export type SpriteLoop = { frames: ImageSourcePropType[]; sequence: number[]; fps: number };

/** `range(3)` is `[0, 1, 2]`; the order of a loop that plays every frame once. */
export const range = (count: number) => Array.from({ length: count }, (_, index) => index);

/** The frame to draw for a step of the loop; a step outside it (or no loop) rests on frame 0, never on nothing. */
export function shownFrame(sequence: number[] | undefined, step: number): number {
  const frame = sequence?.[step];
  return typeof frame === "number" && Number.isInteger(frame) && frame >= 0 ? frame : 0;
}

/**
 * The frame index to show right now. Runs the loop from its first step while `playing` and the owner can see it
 * (focused route, app in front, not hidden behind the lock) and rests on the first step otherwise, so a hidden tab
 * or a stacked screen does not keep a timer ticking.
 */
export function useSpriteFrame(loop: Pick<SpriteLoop, "sequence" | "fps"> | null, playing: boolean): number {
  const foreground = useOwnerVisible();
  const [step, setStep] = useState(0);
  const sequence = loop?.sequence;
  const steps = sequence?.length ?? 0;
  const stepMs = loop ? 1000 / loop.fps : 0;
  const run = playing && foreground && steps > 1;
  useEffect(() => {
    // Six steps a second is a plain timer: the release build drew nothing for frames faded by an animated style,
    // so the loop only toggles ordinary view opacity. Stopping rewinds it to the rest pose.
    setStep(0);
    if (!run) return;
    const timer = setInterval(() => setStep((current) => (current + 1) % steps), stepMs);
    return () => clearInterval(timer);
  }, [run, steps, stepMs]);
  return shownFrame(sequence, step);
}

/** One stacked frame, shown while the loop is on it; swapping opacity never reloads an image. */
function Frame({ source, visible, width, height }: { source: ImageSourcePropType; visible: boolean; width: number; height: number }) {
  return <Image source={source} resizeMode="contain" fadeDuration={0}
    style={[StyleSheet.absoluteFill, { width, height, opacity: visible ? 1 : 0 }]} />;
}

/** Every frame of a loop stacked in a `width` x `height` box; mount it only while the loop is playing. */
export function SpriteFrames({ frames, current, width, height }: {
  frames: ImageSourcePropType[]; current: number; width: number; height: number;
}) {
  return (
    <View pointerEvents="none" style={{ width, height }}>
      {frames.map((source, frame) => (
        <Frame key={frame} source={source} visible={frame === current} width={width} height={height} />
      ))}
    </View>
  );
}
