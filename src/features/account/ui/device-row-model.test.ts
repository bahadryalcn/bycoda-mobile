import { describe, expect, it } from "vitest";
import { deviceDetail, deviceGlyphKind } from "./device-row-model";

const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace(/\{(p\d)\}/g, (_match, key: string) => String(values?.[key] ?? ""));
const now = Date.parse("2026-11-27T12:00:00Z");

describe("device rows", () => {
  it("labels the system and app and says when the device was last seen", () => {
    const detail = deviceDetail({ platform: "ios", osVersion: "iOS 19.1", appVersion: "1.4", lastSeenAt: "2026-11-24T12:00:00Z" }, "en", copy, now);
    expect(detail).toBe("iOS 19.1 · bycoda 1.4 · Last seen: 3 days ago");
  });

  it("names a desktop platform and skips empty parts without stray separators", () => {
    expect(deviceDetail({ platform: "windows", osVersion: "11", appVersion: "", lastSeenAt: "not a date" }, "en", copy, now)).toBe("Windows 11");
  });

  it("chooses the glyph from kind and platform only", () => {
    expect(deviceGlyphKind({ kind: "mobile", platform: "ios" })).toBe("phone");
    expect(deviceGlyphKind({ kind: "desktop", platform: "web" })).toBe("web");
    expect(deviceGlyphKind({ kind: "desktop", platform: "macos" })).toBe("computer");
  });
});
