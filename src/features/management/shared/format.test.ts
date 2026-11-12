import { describe, expect, it, vi } from "vitest";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageTag: "en-US" }] }));
vi.mock("@/state/machines", () => ({ useMachines: { getState: () => ({ language: "en" }) } }));
vi.mock("@/localization", () => ({ resolveLocale: () => "en" }));

const { shortDate } = await import("./format");
const now = new Date(2026, 10, 10).getTime();

describe("shortDate", () => {
  it("omits the year and time within the current year", () => {
    expect(shortDate(new Date(2026, 9, 17, 1, 3).getTime(), now)).toBe("Oct 17");
  });
  it("includes the year for another year", () => {
    expect(shortDate(new Date(2025, 9, 17).getTime(), now)).toBe("Oct 17, 2025");
  });
  it("returns an empty string for an invalid value", () => {
    expect(shortDate(Number.NaN, now)).toBe("");
  });
});
