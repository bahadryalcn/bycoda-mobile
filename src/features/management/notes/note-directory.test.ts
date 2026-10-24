import { expect, it } from "vitest";
import { noteDirectory } from "./note-directory";
import type { Note } from "@/domain/types";
const note = (id: string, patch: Partial<Note> = {}): Note => ({ id, title: id, body: "preview", slug: id, tags: [], createdAt: 1, updatedAt: 1, ...patch });
it("groups each project/tag without dropping global or untagged notes or mutating query data", () => {
  const source = [note("a", { sourceCwd: "/p", tags: ["ui", "ui", "api"] }), note("b")];
  const project = noteDirectory(source, "", "project", "title");
  expect(project.filter((row) => row.kind === "heading").map((row) => row.group)).toEqual(["/p", null]);
  const tags = noteDirectory(source, "", "tag", "title");
  expect(tags.filter((row) => row.kind === "note").map((row) => row.note.id)).toEqual(["a", "a", "b"]);
  expect(new Set(tags.map((row) => row.key)).size).toBe(tags.length);
  expect(source[0].tags).toEqual(["ui", "ui", "api"]);
});
it("orders by content time, not concurrency updates, and searches full project paths", () => {
  const source = [note("Note 10", { updatedAt: 99, contentUpdatedAt: 3 }), note("Note 2", { updatedAt: 5, sourceCwd: "/project/hidden/path" })];
  expect(noteDirectory(source, "", "none", "updated").map((row) => row.kind === "note" && row.note.id)).toEqual(["Note 2", "Note 10"]);
  expect(noteDirectory(source, "", "none", "title").map((row) => row.kind === "note" && row.note.id)).toEqual(["Note 2", "Note 10"]);
  expect(noteDirectory(source, "hidden/path", "none", "created")).toHaveLength(1);
});
