import { afterEach, expect, it } from "vitest";

import { applyMobileTheme, getMobileThemeKey, refreshMaterialYouPalette } from "./tokens.ts";

afterEach(() => applyMobileTheme("dark", "classic"));

it("re-keys the Material You palette on refresh and leaves other palettes alone", () => {
  applyMobileTheme("dark", "material");
  const before = getMobileThemeKey();
  expect(before).toMatch(/^material:dark:\d+$/);

  refreshMaterialYouPalette();
  const after = getMobileThemeKey();
  expect(after).toMatch(/^material:dark:\d+$/);
  expect(after).not.toBe(before);

  applyMobileTheme("dark", "classic");
  const classic = getMobileThemeKey();
  refreshMaterialYouPalette();
  expect(getMobileThemeKey()).toBe(classic);
  expect(classic).toBe("classic:dark");
});
