import { expect, it } from "vitest";
import { selectableByDefault } from "./text-selection";

it("keeps line-limited text non-selectable so Android truncates it instead of wrapping", () => {
  expect(selectableByDefault(1)).toBe(false);
  expect(selectableByDefault(2)).toBe(false);
  expect(selectableByDefault(undefined)).toBe(true);
  expect(selectableByDefault(0)).toBe(true);
});
