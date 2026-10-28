import { expect, it } from "vitest";
import { matchesSearch } from "./search";

it("uses the selected app language for Turkish dotted and dotless I", () => {
  expect(matchesSearch("İZMİR", "izmir", "tr")).toBe(true);
  expect(matchesSearch("IŞIK", "ışık", "tr")).toBe(true);
  expect(matchesSearch("I", "i", "tr")).toBe(false);
  expect(matchesSearch("I", "i", "en")).toBe(true);
});

it("matches the whitespace-collapsed text visible in list previews", () => {
  expect(matchesSearch("Design\n\n   review", " design review ", "en")).toBe(true);
  expect(matchesSearch("Design review", "unmatched", "en")).toBe(false);
  expect(matchesSearch("Design review", "  ", "en")).toBe(true);
});
