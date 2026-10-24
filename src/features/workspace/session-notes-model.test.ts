import { describe, expect, it } from "vitest";
import { readSessionNote, readSessionNotes } from "./session-notes-model";
const note = { id: "note-a", slug: "note-a", title: "Note", body: "preview", tags: [], sourceSessionId: "session-a", sourceCwd: "/worktree", createdAt: 1, updatedAt: 2 };

describe("session note scope", () => {
  it("retains preview coverage and reads only the selected full note", () => {
    expect(readSessionNotes({ notes: [note], total: 600 }, "session-a")).toEqual({ notes: [note], total: 600 });
    const full = { ...note, body: "body".repeat(500) };
    expect(readSessionNote(full, "session-a", note.id)).toBe(full);
    expect(readSessionNote(null, "session-a", note.id)).toBeNull();
  });
  it("refuses another session, note identity, duplicate IDs and oversized previews", () => {
    expect(() => readSessionNotes({ notes: [note], total: 1 }, "session-b")).toThrow();
    expect(() => readSessionNotes({ notes: [note, note], total: 2 }, "session-a")).toThrow();
    expect(() => readSessionNotes({ notes: [{ ...note, body: "x".repeat(1001) }], total: 1 }, "session-a")).toThrow();
    expect(() => readSessionNote(note, "session-a", "note-b")).toThrow();
    expect(() => readSessionNotes({ notes: [note], total: 0 }, "session-a")).toThrow();
  });
});
