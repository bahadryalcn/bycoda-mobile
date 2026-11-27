import { expect, it } from "vitest";
import { deviceAvailabilityIssues } from "./device-availability";

it("coalesces blank and repeated discovery errors without merging independent failures", () => {
  expect(deviceAvailabilityIssues([" ", " SDK missing ", "SDK missing", "Bridge timed out"], [], "Unavailable"))
    .toEqual(["SDK missing", "Bridge timed out"]);
});
it("retains platform identity when list and status report the same reason", () => {
  expect(deviceAvailabilityIssues(["Requires macOS", "ios: Requires macOS", "Android discovery failed"],
    [{ platform: "ios", available: false, reason: " Requires macOS " }], "Unavailable"))
    .toEqual(["Android discovery failed", "ios: Requires macOS"]);
});
it("retains both platform identities for a shared reason", () => {
  expect(deviceAvailabilityIssues(["Service unavailable"], [
    { platform: "android", available: false, reason: "Service unavailable" },
    { platform: "ios", available: false, reason: "Service unavailable" },
  ], "Unavailable")).toEqual(["android: Service unavailable", "ios: Service unavailable"]);
});
it("ignores available platform notes and retains an explicit fallback for missing reasons", () => {
  expect(deviceAvailabilityIssues([], [
    { platform: "android", available: true, reason: "Informational note" },
    { platform: "ios", available: false, reason: " " },
  ], "Unavailable")).toEqual(["ios: Unavailable"]);
});

it("names platforms as people know them", async () => {
  const { deviceAvailabilityIssues, devicePlatformName } = await import("./device-availability");
  expect(deviceAvailabilityIssues([], [{ platform: "ios", available: false, reason: null }], "Unavailable", devicePlatformName)).toEqual(["iOS: Unavailable"]);
});
