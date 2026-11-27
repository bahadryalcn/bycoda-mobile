import { expect, it } from "vitest";
import {
  LIVE_FRAME_BASE_MS,
  LIVE_FRAME_MAX_MS,
  LIVE_IDLE_FRAME_MS,
  LIVE_IDLE_MS,
  LIVE_LONG_IDLE_MS,
  liveFrameInterval,
  paceFrame,
  type FramePace,
  type PacedFrame,
} from "./device-frame-pace";

// Synthetic payloads only; no real device screenshot is involved.
const frame = (base64: string, capturedAt: string): PacedFrame => ({ mime: "image/png", base64, capturedAt });
const feed = (frames: PacedFrame[]) => frames.reduce<FramePace | undefined>(paceFrame, undefined);

it("polls at the base rate until the screen repeats", () => {
  expect(liveFrameInterval(undefined)).toBe(LIVE_FRAME_BASE_MS);
  expect(liveFrameInterval(feed([frame("AAAA", "1"), frame("AAAA", "2")]))).toBe(LIVE_FRAME_BASE_MS);
});

it("backs off on identical frames up to a bounded maximum", () => {
  const frames = Array.from({ length: 12 }, (_, index) => frame("AAAA", String(index)));
  const intervals = frames.map((_, index) => liveFrameInterval(feed(frames.slice(0, index + 1))));
  expect(intervals.slice(0, 5)).toEqual([3_000, 3_000, 6_000, 6_000, 12_000]);
  expect(Math.max(...intervals)).toBe(LIVE_FRAME_MAX_MS);
  expect(intervals.at(-1)).toBe(LIVE_FRAME_MAX_MS);
});

it("returns to the base rate as soon as the screen changes", () => {
  const still = Array.from({ length: 10 }, (_, index) => frame("AAAA", String(index)));
  expect(liveFrameInterval(feed(still))).toBe(LIVE_FRAME_MAX_MS);
  expect(liveFrameInterval(feed([...still, frame("BBBB", "10")]))).toBe(LIVE_FRAME_BASE_MS);
  expect(liveFrameInterval(feed([...still, { ...frame("AAAA", "10"), mime: "image/jpeg" }]))).toBe(LIVE_FRAME_BASE_MS);
});

it("re-evaluating the same capture does not count as another repeat", () => {
  const first = feed([frame("AAAA", "1"), frame("AAAA", "2")]);
  const same = frame("AAAA", "2");
  expect(paceFrame(first, same)).toBe(first);
  expect(paceFrame(first, first!.frame)).toBe(first);
});

it("slows a constantly changing screen once the viewer is idle", () => {
  const changing = feed([frame("AAAA", "1"), frame("BBBB", "2")]);
  expect(liveFrameInterval(changing, LIVE_IDLE_MS - 1)).toBe(LIVE_FRAME_BASE_MS);
  expect(liveFrameInterval(changing, LIVE_IDLE_MS)).toBe(LIVE_IDLE_FRAME_MS);
  expect(liveFrameInterval(changing, LIVE_LONG_IDLE_MS)).toBe(LIVE_FRAME_MAX_MS);
  // Idle never shortens a static screen's back-off.
  const still = Array.from({ length: 10 }, (_, index) => frame("AAAA", String(index)));
  expect(liveFrameInterval(feed(still), LIVE_IDLE_MS)).toBe(LIVE_FRAME_MAX_MS);
});
