import { expect, it } from "vitest";
import { parseSystemColorSwatches } from "../../modules/bycoda-system-colors/swatches";
import { readSystemColorSwatches } from "../../modules/bycoda-system-colors";

it("requires every role to contain a six-digit hex color", () => {
  const roles = { primary: "#6750A4", onPrimary: "#FFFFFF", primaryContainer: "#EADDFF", onPrimaryContainer: "#21005D", surface: "#FFFBFE", surfaceVariant: "#E7E0EC", onSurface: "#1C1B1F", onSurfaceVariant: "#49454F" };
  expect(parseSystemColorSwatches(roles)).toEqual(roles);
  expect(parseSystemColorSwatches({ ...roles, primary: { resource_paths: [] } })).toBeNull();
  expect(parseSystemColorSwatches({ ...roles, primary: "#123" })).toBeNull();
  expect(parseSystemColorSwatches({ primary: "#123456" })).toBeNull();
  expect(parseSystemColorSwatches(null)).toBeNull();
});

it("returns null on platforms without the Android reader", () => {
  expect(readSystemColorSwatches(false)).toBeNull();
  expect(readSystemColorSwatches(true)).toBeNull();
});
