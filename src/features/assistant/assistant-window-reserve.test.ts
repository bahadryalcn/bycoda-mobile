import { expect, it } from "vitest";
import { assistantWindowReserve } from "./assistant-window-reserve";

it("reserves bottom room only while the window rests in the lower half", () => {
  // Regression: the minimized window covered Send on Feedback and Sign out on Account.
  expect(assistantWindowReserve(true, 1, 64, 6)).toBe(70);
  expect(assistantWindowReserve(true, 0.2, 64, 6)).toBe(0);
  expect(assistantWindowReserve(false, 1, 64, 6)).toBe(0);
  expect(assistantWindowReserve(true, 1, Number.NaN, 6)).toBe(0);
});
