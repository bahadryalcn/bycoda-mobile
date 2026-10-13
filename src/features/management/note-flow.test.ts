import { describe, expect, it } from "vitest";
import type { LocalNoteDraft } from "./note-drafts";
import { initialNoteFlow, noteFlowReducer } from "./note-flow";

const draft: LocalNoteDraft = {
  id: "note-b",
  title: "Unsaved work",
  body: "Keep this edit",
  tags: "mobile",
  expectedUpdatedAt: 0,
  sourceCwd: "/original/project",
};
describe("note editor completion ownership", () => {
  it("does not close a newer draft when an earlier save or delete completes", () => {
    const original = noteFlowReducer(initialNoteFlow, { type: "open", id: "note-a" });
    const closed = noteFlowReducer(original, { type: "close", expected: original });
    const newer = noteFlowReducer(closed, { type: "draft", initial: draft });
    expect(noteFlowReducer(newer, { type: "close", expected: original })).toBe(newer);
  });
  it("does not replace a note opened while draft recovery was pending", () => {
    const existing = noteFlowReducer(initialNoteFlow, { type: "open", id: "note-a" });
    expect(
      noteFlowReducer(existing, { type: "recover", initial: draft, expected: initialNoteFlow }),
    ).toBe(existing);
  });
  it("does not revive a stale recovery after another editor has opened and closed", () => {
    const existing = noteFlowReducer(initialNoteFlow, { type: "open", id: "note-a" });
    const closedAgain = noteFlowReducer(existing, { type: "close", expected: existing });
    expect(
      noteFlowReducer(closedAgain, { type: "recover", initial: draft, expected: initialNoteFlow }),
    ).toBe(closedAgain);
  });
});
