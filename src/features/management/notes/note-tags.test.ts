import { expect, it } from "vitest";
import { noteTagIssue, noteTags, noteTitleTooLong } from "./note-tags";

it("preserves ordinary normalization without dropping a distinct tag", () => {
  expect(noteTags(" #Hello World, hello-world, , #Second--- ")).toEqual(["hello-world", "second"]);
  expect(noteTagIssue(noteTags(Array.from({ length: 20 }, (_, index) => `tag${index}`).join(",")))).toBeUndefined();
  const excess = noteTags(Array.from({ length: 21 }, (_, index) => `tag${index}`).join(","));
  expect(excess).toHaveLength(21);
  expect(noteTagIssue(excess)).toBe("count");
});
it("counts Unicode code points at the host's forty-eight-character boundary", () => {
  expect(noteTagIssue(noteTags("🙂".repeat(48)))).toBeUndefined();
  const long = noteTags("🙂".repeat(49));
  expect(noteTagIssue(long)).toBe("length");
  expect(long[0]).toBe("🙂".repeat(49));
});

it("rejects excess title content before the host's two-hundred-code-point cut", () => {
  expect(noteTitleTooLong(` ${"🙂".repeat(200)} `)).toBe(false);
  expect(noteTitleTooLong("🙂".repeat(201))).toBe(true);
  expect(noteTitleTooLong("a".repeat(201))).toBe(true);
});
