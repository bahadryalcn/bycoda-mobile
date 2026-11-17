import { expect, it } from "vitest";
import { formatPlaybackTime } from "./preview-audio-model";

it("formats m:ss and guards bad input", () => {
  expect(formatPlaybackTime(65.9)).toBe("1:05");
  expect(formatPlaybackTime(0)).toBe("0:00");
  expect(formatPlaybackTime(NaN)).toBe("0:00");
  expect(formatPlaybackTime(-3)).toBe("0:00");
});
