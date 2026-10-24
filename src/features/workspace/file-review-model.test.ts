import { describe, expect, it, vi } from "vitest";
import {
  fileDraftStorageKey,
  MAX_REVIEW_CHARACTERS,
  readPreservedFileDraft,
  reviewSource,
} from "./file-review-model";

describe("read-only file inspection", () => {
  it("opens a bounded exact line window with context without changing source or original numbering", () => {
    const text = Array.from({ length: 5000 }, (_, index) => `line-${index + 1}`).join("\r\n");
    const result = reviewSource(text, 4500);
    expect(result.targetLine).toBe(4500);
    expect(result.lines.slice(0, 4)).toEqual([
      { number: 4497, text: "line-4497" },
      { number: 4498, text: "line-4498" },
      { number: 4499, text: "line-4499" },
      { number: 4500, text: "line-4500" },
    ]);
    expect(result.lines.length).toBeLessThanOrEqual(2000);
    expect(result.characters).toBe(text.length);
    expect(result.locationUnavailable).toBe(false);
    expect(reviewSource(text).lines[0].number).toBe(1);
  });

  it("refuses missing, invalid and out-of-character-budget locations instead of inventing a destination", () => {
    for (const line of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 9999]) {
      expect(reviewSource("first\nsecond", line)).toMatchObject({
        targetLine: undefined,
        locationUnavailable: true,
      });
    }
    const source = "x".repeat(MAX_REVIEW_CHARACTERS) + "\nnot-in-preview";
    expect(reviewSource(source, 2)).toMatchObject({
      targetLine: undefined,
      locationUnavailable: true,
      truncated: true,
    });
    expect(reviewSource("file shortened", 450)).toMatchObject({
      targetLine: undefined,
      locationUnavailable: true,
    });
    expect(reviewSource("first\nsecond", 1).lines[0]).toEqual({ number: 1, text: "first" });
  });

  it("recovers the exact existing draft namespace without ever writing or deleting it", async () => {
    const key = fileDraftStorageKey("computer-a", "project", "/checkout", "src/file.ts");
    expect(key).toBe(
      'bycoda.mobile.file-draft.v1:["computer-a","project","/checkout","src/file.ts"]',
    );
    const draft = { expected: "host before", content: "my preserved edit" };
    const storage = {
      getItem: vi.fn(async () => JSON.stringify(draft)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(await readPreservedFileDraft(storage, key)).toEqual(draft);
    expect(storage.getItem).toHaveBeenCalledWith(key);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(fileDraftStorageKey("computer-b", "project", "/checkout", "src/file.ts")).not.toBe(key);
    expect(fileDraftStorageKey("computer-a", "project", "/other-checkout", "src/file.ts")).not.toBe(
      key,
    );
  });

  it("keeps failed or malformed recovery reads as errors, preserving stored data", async () => {
    await expect(readPreservedFileDraft({ getItem: async () => null }, "key")).resolves.toBeNull();
    await expect(
      readPreservedFileDraft({ getItem: async () => '{"content":"draft"}' }, "key"),
    ).rejects.toThrow();
    await expect(
      readPreservedFileDraft(
        {
          getItem: async () => {
            throw new Error("read failed");
          },
        },
        "key",
      ),
    ).rejects.toThrow("read failed");
  });

  it("numbers exact source lines while bounding oversized files and wide lines visibly", () => {
    expect(reviewSource("first\r\n\t界😀\n").lines).toEqual([
      { number: 1, text: "first" },
      { number: 2, text: "\t界😀" },
      { number: 3, text: "" },
    ]);
    expect(reviewSource("\t界😀").columns).toBe(12);
    expect(reviewSource("unchanged").truncated).toBe(false);
    const text = "x".repeat(MAX_REVIEW_CHARACTERS + 1);
    const result = reviewSource(text);
    expect(result.truncated).toBe(true);
    expect(result.lines[0].text.length).toBe(2000);
    expect(result.characters).toBe(text.length);
    const many = reviewSource("line\n".repeat(3000));
    expect(many.lines).toHaveLength(2000);
    expect(many.truncated).toBe(true);
    expect(text.length).toBe(MAX_REVIEW_CHARACTERS + 1);
  });
});
