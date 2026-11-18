import { describe, expect, it } from "vitest";
import { deviceSystemLabel } from "./device-system";

describe("deviceSystemLabel", () => {
  it("does not repeat the platform", () => {
    expect(deviceSystemLabel({ platform: "android", version: "Android" })).toBe("Android");
  });
  it("joins platform and version", () => {
    expect(deviceSystemLabel({ platform: "android", version: "16" })).toBe("Android 16");
    expect(deviceSystemLabel({ platform: "ios", version: "" })).toBe("iOS");
  });
});
