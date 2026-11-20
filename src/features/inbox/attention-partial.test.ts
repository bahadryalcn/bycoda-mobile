import { expect, it } from "vitest";
import { attentionPartial } from "./attention-partial";

it("reports only a non-empty unavailable project list as a partial read", () => {
  expect(attentionPartial({ unavailableProjectIds: ["a"] })).toBe(true);
  // Hosts that predate the field, and complete reads, omit it.
  expect(attentionPartial({})).toBe(false);
  expect(attentionPartial(undefined)).toBe(false);
  expect(attentionPartial({ unavailableProjectIds: [] })).toBe(false);
  expect(attentionPartial({ unavailableProjectIds: "a" })).toBe(false);
});
