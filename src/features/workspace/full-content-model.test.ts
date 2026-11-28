import { expect, it } from "vitest";
import type { Block } from "./wire";
import { fullContentBlock, needsFullContent } from "./full-content-model";

const preview: Block = { id: "b", role: "user", text: "cut…", remoteContent: { revision: 3, bytes: 40_000 } };
const whole: Block = { id: "b", role: "user", text: "x".repeat(40_000) };

it("a complete block needs no second read", () => {
  const short: Block = { id: "a", role: "user", text: "hello" };
  expect(needsFullContent(short)).toBe(false);
  expect(fullContentBlock(short)).toBe(short);
});

it("a preview needs its whole block before any action uses the words", () => {
  expect(needsFullContent(preview)).toBe(true);
  expect(fullContentBlock(preview)).toBeUndefined();
  expect(needsFullContent(preview, whole)).toBe(false);
  expect(fullContentBlock(preview, whole)).toBe(whole);
});

it("never accepts another block's content as the whole", () => {
  const other: Block = { id: "other", role: "user", text: "other" };
  expect(needsFullContent(preview, other)).toBe(true);
  expect(fullContentBlock(preview, other)).toBeUndefined();
});
