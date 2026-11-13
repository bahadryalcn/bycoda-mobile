import { expect, it } from "vitest";
import { decodeTerminalDraft, encodeTerminalDraft, terminalDraftKey } from "./terminal-draft";
it("fences every connection and project identity field", () => {
  const identity = ["machine", "endpoint", "environment", "key", "project"];
  expect(new Set([terminalDraftKey(identity), ...identity.map((_, index) => terminalDraftKey(identity.map((value, i) => i === index ? "changed" : value))) ]).size).toBe(6);
});
it("retains exact commands and uncertainty without converting them to input", () => {
  const draft = { commands: { retired: "  printf retained\n" }, uncertain: true };
  expect(decodeTerminalDraft(encodeTerminalDraft(draft)!)).toEqual(draft);
  expect(encodeTerminalDraft({ commands: {}, uncertain: true })).not.toBeNull();
  expect(encodeTerminalDraft({ commands: { empty: "" }, uncertain: false })).toBeNull();
});
it.each(["null", "{}", '{"commands":[],"uncertain":false}', '{"commands":{"one":12},"uncertain":false}'])("rejects invalid stored data without replacing it: %s", raw => {
  expect(() => decodeTerminalDraft(raw)).toThrow("Invalid saved terminal draft.");
});
