import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/localization";
import { inboxRelativeTime } from "./inbox-time";

const now = Date.UTC(2026, 9, 21, 12);
const copy = (tr: string, en: string, values?: Record<string, string | number>) =>
  translate("tr", tr, en, values);

afterEach(() => vi.restoreAllMocks());

describe("inbox timestamps", () => {
  it("keeps rendering rows when the native runtime lacks RelativeTimeFormat", () => {
    vi.spyOn(Intl, "RelativeTimeFormat", "get").mockReturnValue(undefined as never);
    expect(inboxRelativeTime(now, "tr", copy, now)).toBe("Şimdi");
    expect(inboxRelativeTime(now - 5 * 60_000, "tr", copy, now)).toBe("5 dk");
    expect(inboxRelativeTime(now - 2 * 3_600_000, "tr", copy, now)).toBe("2 sa");
    expect(inboxRelativeTime(now - 3 * 86_400_000, "tr", copy, now)).toBe("3 g");
  });

  it("falls back when locale formatting throws", () => {
    vi.spyOn(Intl, "RelativeTimeFormat").mockImplementation(function () { throw new RangeError("unsupported locale"); });
    expect(inboxRelativeTime(now - 60_000, "tr", copy, now)).toBe("1 dk");
    expect(inboxRelativeTime(now + 86_400_000, "tr", copy, now)).toBe("2026-10-22");
  });

  it("preserves localized relative dates on supported runtimes", () => {
    expect(inboxRelativeTime(now - 3_600_000, "tr", copy, now)).toBe(
      new Intl.RelativeTimeFormat("tr", { numeric: "auto", style: "narrow" }).format(-1, "hour"),
    );
  });

  it("ignores invalid host timestamps", () => {
    for (const value of [0, -1, NaN, Infinity, Number.MAX_VALUE])
      expect(inboxRelativeTime(value, "tr", copy, now)).toBe("");
  });
});
