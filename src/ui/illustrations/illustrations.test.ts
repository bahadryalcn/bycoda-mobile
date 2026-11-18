// @vitest-environment happy-dom
import { existsSync, readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock("expo-image", () => ({
  Image: ({ source, style }: { source: string; style: { width: number; height: number } }) =>
    createElement("img", { "data-rest": "true", src: source, width: style.width, height: style.height }),
}));
vi.mock("react-native", () => ({
  View: ({ children, style, testID, accessible, importantForAccessibility }: {
    children: ReactNode; style: { width: number; height: number }; testID: string; accessible: boolean; importantForAccessibility: string;
  }) => createElement("div", {
    "data-testid": testID, "data-accessible": String(accessible), "data-importance": importantForAccessibility,
    "data-width": style.width, "data-height": style.height,
  }, children),
}));
vi.mock("react-native-reanimated", () => ({ useReducedMotion: () => motion.reduced }));
vi.mock("../sprite-player", () => ({
  useSpriteFrame: () => 0,
  SpriteFrames: ({ frames }: { frames: string[] }) => frames.map((source) => createElement("img", { key: source, src: source })),
}));

import { art } from "./art";
import { Illustration, illustrationNames } from "./index";

const artNames = Object.keys(art) as (keyof typeof art)[];

const render = (name: (typeof artNames)[number], size?: number) => {
  const holder = document.createElement("div");
  holder.innerHTML = renderToStaticMarkup(createElement(Illustration, { name, size }));
  // React hoists image preloads in front of the scene, so find the scene by its test id.
  return holder.querySelector("[data-testid]")!;
};

/** Pixel size read from a PNG's IHDR chunk. */
const pngSize = (path: string) => {
  const header = readFileSync(path);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};

describe("state illustration art", () => {
  it.each(artNames)("%s has a rest frame first and a valid loop", (name) => {
    const { frames, sequence, fps } = art[name];
    expect(frames.length).toBeGreaterThan(1);
    expect(sequence[0]).toBe(0);
    expect(sequence.every((index) => Number.isInteger(index) && index >= 0 && index < frames.length)).toBe(true);
    // No frame is shipped that the loop never plays.
    expect(new Set(sequence).size).toBe(frames.length);
    expect(fps).toBeGreaterThanOrEqual(4);
    expect(fps).toBeLessThanOrEqual(8);
  });

  it.each(artNames)("%s frames are files whose size matches the aspect", (name) => {
    const { frames, aspect } = art[name];
    // Vitest resolves a required asset to its file path, so the frames can be read straight from disk.
    const sizes = (frames as string[]).map((path) => {
      expect(existsSync(path)).toBe(true);
      return pngSize(path);
    });
    // Every frame shares the canvas of the rest pose, so the scene never jumps between steps.
    expect(new Set(sizes.map((size) => `${size.width}x${size.height}`)).size).toBe(1);
    expect(sizes[0]!.width / sizes[0]!.height).toBeCloseTo(aspect, 2);
  });

  it("keeps the app lock hero out of the product states", () => {
    expect(illustrationNames).toHaveLength(12);
    expect(illustrationNames).not.toContain("lock-hero");
    expect(artNames).toContain("lock-hero");
  });
});

describe("state illustration family", () => {
  it.each(artNames)("renders %s as decorative art at the requested height", (name) => {
    motion.reduced = false;
    const scene = render(name, 120);
    expect(scene.getAttribute("data-testid")).toBe(`illustration-${name}`);
    expect(scene.getAttribute("data-accessible")).toBe("false");
    expect(scene.getAttribute("data-importance")).toBe("no-hide-descendants");
    expect(Number(scene.getAttribute("data-height"))).toBe(120);
    // Wide scenes never grow past 1.4x their height, so a state column keeps its width.
    expect(Number(scene.getAttribute("data-width"))).toBeLessThanOrEqual(168);
    expect(scene.querySelectorAll("img")).toHaveLength(art[name].frames.length);
  });

  it("shows only the rest frame under reduced motion", () => {
    motion.reduced = true;
    const scene = render("connect-computer", 120);
    const images = scene.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]!.getAttribute("src")).toBe(art["connect-computer"].frames[0]);
    motion.reduced = false;
  });

  it("gives all twelve states distinct art", () => {
    const rest = illustrationNames.map((name) => art[name].frames[0]);
    expect(new Set(rest).size).toBe(12);
  });
});
