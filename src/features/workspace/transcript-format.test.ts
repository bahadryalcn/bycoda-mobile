import { describe, expect, it } from "vitest";
import { formatMessageTime, hasTurnMetrics, turnDurationLabel, turnMetricsLines } from "./transcript-format";

const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace(/\{(p\d+)\}/g, (_, key: string) => String(values?.[key]));

describe("transcript formatting", () => {
  const now = new Date(2026, 10, 14, 15, 0).getTime();
  it("reads today as a clock, yesterday by name and older days with a date", () => {
    expect(formatMessageTime(new Date(2026, 10, 14, 9, 5).getTime(), "en-GB", copy, now)).toBe("09:05");
    expect(formatMessageTime(new Date(2026, 10, 13, 9, 5).getTime(), "en-GB", copy, now)).toBe(
      "Yesterday 09:05",
    );
    expect(formatMessageTime(new Date(2026, 2, 3, 9, 5).getTime(), "en-GB", copy, now)).toMatch(/3 Mar.*09:05/);
    expect(formatMessageTime(new Date(2025, 2, 3, 9, 5).getTime(), "en-GB", copy, now)).toMatch(/2025/);
    expect(formatMessageTime(Number.NaN, "en", copy, now)).toBe("");
  });
  it("says who worked and for how long", () => {
    expect(turnDurationLabel(125_000, "Opus", copy)).toBe("Opus worked for 2 min");
    expect(turnDurationLabel(5_000, undefined, copy)).toBe("Worked for 5 s");
    expect(turnDurationLabel(undefined, "Opus", copy)).toBe("Opus worked");
  });
  it("summarizes turn metrics like desktop", () => {
    expect(hasTurnMetrics({})).toBe(false);
    expect(hasTurnMetrics(undefined)).toBe(false);
    const lines = turnMetricsLines(
      { inputTokens: 12_000, outputTokens: 2_000, cacheReadTokens: 9_000, cacheHitPercent: 74.6 },
      10_000,
      "en",
      copy,
    );
    expect(lines.headline).toBe("Cache hit 75% · Output 200 tok/s");
    expect(lines.detail).toBe("12K input · 2K output · 9K cached");
    expect(turnMetricsLines({ inputTokens: 5 }, undefined, "en", copy).headline).toBe("Turn tokens");
  });
});
