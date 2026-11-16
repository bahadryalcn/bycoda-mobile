import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_TYPOGRAPHY } from "./typography-preferences";
import { applyTypography, applyTextPreferences, subscribeTypography, typographyFont } from "./typography-runtime";
import { createThemedStyles } from "./themed-styles";

afterEach(() => applyTypography(DEFAULT_TYPOGRAPHY));

it("updates cached sheets, preserves native scaling and code font, leaves layout alone", () => {
  const sheet = createThemedStyles(() => ({
    body: { fontSize: 15, lineHeight: 20 },
    code: { fontSize: 12, lineHeight: 18, fontFamily: "Menlo" },
    heading: { fontSize: 20, fontWeight: "800" as const },
    layout: { minHeight: 48 },
  }));
  const before = sheet.body;
  const listener = vi.fn();
  const unsubscribe = subscribeTypography(listener);
  const next = { scale: 1.2, lineSpacing: 1.25, fontFamily: "serif", weight: "medium" } as const;
  applyTypography(next);
  applyTypography(next);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(sheet.body).not.toBe(before);
  expect(sheet.body).toMatchObject({ fontSize: 18, lineHeight: 30, fontFamily: typographyFont("serif"), fontWeight: "500" });
  expect(sheet.body).not.toHaveProperty("allowFontScaling");
  expect(sheet.code.fontFamily).toBe("Menlo");
  expect(sheet.code.fontSize).toBeCloseTo(14.4);
  expect(sheet.heading.fontWeight).toBe("800");
  expect(sheet.layout).toEqual({ minHeight: 48 });
  unsubscribe();
  applyTypography(DEFAULT_TYPOGRAPHY);
  expect(sheet.body).toMatchObject(before);
});

it("maps supported platform fonts without downloading assets", () => {
  expect(typographyFont("serif", "ios")).toBe("Georgia");
  expect(typographyFont("mono", "ios")).toBe("Menlo");
  expect(typographyFont("sans", "android")).toBe("sans-serif");
  expect(typographyFont("system")).toBeUndefined();
  expect(applyTextPreferences({ padding: 4 })).toEqual({ padding: 4 });
});
