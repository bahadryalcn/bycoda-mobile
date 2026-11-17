import { expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ getSwatches: vi.fn() }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => native }));
vi.mock("../../modules/bycoda-system-colors/index.ts", async () => await import("../../modules/bycoda-system-colors/index.android"));
import { derivePaletteColors, PALETTES, readMaterialYouSwatches } from "./palettes";
import { darkColors, lightColors, resolveMobilePalette } from "./tokens";
import { themeColorRoles } from "./theme-color-roles";

it("reads native hex roles synchronously for the requested mode before palette derivation", () => {
  const roles = { primary: "#6750A4", onPrimary: "#FFFFFF", primaryContainer: "#EADDFF", onPrimaryContainer: "#21005D", surface: "#FFFBFE", surfaceVariant: "#E7E0EC", onSurface: "#1C1B1F", onSurfaceVariant: "#49454F" };
  native.getSwatches.mockReturnValue(roles);
  const definition = PALETTES.find(palette => palette.id === "material")!;
  expect(derivePaletteColors(definition, "light", lightColors).accent).toBe(roles.primary);
  expect(native.getSwatches).toHaveBeenLastCalledWith(false);
  expect(derivePaletteColors(definition, "dark", darkColors).background).toBe(roles.surface);
  expect(native.getSwatches).toHaveBeenLastCalledWith(true);
  const dynamic = themeColorRoles(resolveMobilePalette("material", "light"));
  expect(dynamic.primary).toBe(roles.primary);
  expect(dynamic.foreground).toBe(roles.onSurface);
  expect(dynamic.surface).toBe(roles.surface);
  const classic = themeColorRoles(resolveMobilePalette("classic", "light"));
  expect(classic.primary).toBe(lightColors.accentSolid);
  expect(classic.surface).toBe(lightColors.panel);
  native.getSwatches.mockReturnValue(null);
  expect(readMaterialYouSwatches("light")).toBeNull();
});
