import { describe, expect, it } from "vitest";
import { citedTurnEntry } from "./session-reference-target";
import type { TranscriptEntry } from "./transcript-model";
const message = (id: string, role = "user", extra = {}) =>
  ({ id, kind: "message", block: { id, role, ...extra } }) as TranscriptEntry;
describe("cited turn target", () => {
  it("matches only the exact visible user turn, not other blocks or drafts", () => {
    expect(citedTurnEntry([message("one"), message("two", "assistant")], "one")?.id).toBe("one");
    expect(citedTurnEntry([message("one", "assistant")], "one")).toBeUndefined();
    expect(citedTurnEntry([message("one", "user", { draft: true })], "one")).toBeUndefined();
    expect(citedTurnEntry([message("one", "user", { internal: true })], "one")).toBeUndefined();
    expect(citedTurnEntry([message("other")], "one")).toBeUndefined();
  });
});
