import { describe, expect, it } from "vitest";
import { decodeDataSaverMode, encodeDataSaverMode, isDataSaverActive } from "./data-saver-model";

describe("data saver decision", () => {
  it("on and off ignore the network", () => {
    expect(isDataSaverActive("on", { type: "wifi" })).toBe(true);
    expect(isDataSaverActive("off", { type: "cellular", details: { isConnectionExpensive: true } })).toBe(false);
  });
  it("auto follows cellular or a metered connection", () => {
    expect(isDataSaverActive("auto", { type: "cellular" })).toBe(true);
    expect(isDataSaverActive("auto", { type: "wifi", details: { isConnectionExpensive: true } })).toBe(true);
    expect(isDataSaverActive("auto", { type: "wifi", details: { isConnectionExpensive: false } })).toBe(false);
    expect(isDataSaverActive("auto", { type: "unknown" })).toBe(false);
    expect(isDataSaverActive("auto", undefined)).toBe(false);
  });
  it("persists a versioned value and falls back to auto", () => {
    expect(decodeDataSaverMode(encodeDataSaverMode("on"))).toBe("on");
    expect(decodeDataSaverMode(null)).toBe("auto");
    expect(decodeDataSaverMode("{bad")).toBe("auto");
    expect(decodeDataSaverMode('{"dataSaver":"x"}')).toBe("auto");
  });
});
