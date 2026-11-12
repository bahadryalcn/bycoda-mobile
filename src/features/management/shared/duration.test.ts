import { describe, expect, it } from "vitest";
import { formatDuration } from "./duration";

const copy = (_tr: string, en: string, values: Record<string, string | number> = {}) =>
  en.replace(/\{(p\d)\}/g, (_match, key: string) => String(values[key]));

describe("formatDuration", () => {
  it("formats seconds, minutes, hours and days", () => {
    expect(formatDuration(500, copy)).toBe("1 s");
    expect(formatDuration(45_000, copy)).toBe("45 s");
    expect(formatDuration(14 * 60_000, copy)).toBe("14 min");
    expect(formatDuration(125 * 60_000, copy)).toBe("2 h 5 min");
    expect(formatDuration(180 * 60_000, copy)).toBe("3 h");
    expect(formatDuration(75 * 3_600_000, copy)).toBe("3 d");
  });
  it("returns nothing for an unknown or negative span", () => {
    expect(formatDuration(undefined, copy)).toBe("");
    expect(formatDuration(-1, copy)).toBe("");
    expect(formatDuration(Number.NaN, copy)).toBe("");
  });
});
