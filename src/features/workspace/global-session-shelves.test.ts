import { expect, it } from "vitest";
import { globalSessionRows } from "./global-session-shelves";

const layout = (folders: object[]) => ({ folders, order: { pinned: [], loose: [] } });
const folder = (id: string, sessionIds: string[], extra: object = {}) =>
  ({ id, name: id, sessionIds, collapsed: false, pinned: false, ordered: false, ...extra });
const p = (id: string, folders: object[] = []) =>
  ({ id, name: id, cwd: `/${id}`, sessionLayout: folders.length ? layout(folders) : undefined }) as never;
const e = (project: never, id: string, extra: object = {}) =>
  ({ project, session: { id, title: id, status: "idle", updatedAt: 1, ...extra } }) as never;
const keys = (rows: ReturnType<typeof globalSessionRows>) =>
  rows.map((row) => (row.kind === "header" ? `${row.shelf}:${row.count}` : row.key));

it("shows each project's folders in Recent and leaves loose sessions in directory order", () => {
  const a = p("a", [folder("f", ["a1"]), folder("g", ["a2"], { parentId: "f" })]);
  const b = p("b");
  const rows = globalSessionRows([e(b, "b1"), e(a, "a1"), e(a, "a2"), e(a, "a3")]);
  expect(keys(rows)).toEqual(["recent:4", "a:folder:f", "a:folder:g", "a:session:a2", "a:session:a1", "b:b1", "a:a3"]);
});

it("keeps status shelves flat and respects folder collapse per project", () => {
  const a = p("a", [folder("f", ["a1", "a2"])]);
  const rows = globalSessionRows([e(a, "a1", { pinned: true }), e(a, "a2")], { a: { f: true } });
  expect(keys(rows)).toEqual(["pinned:1", "a:a1", "recent:1", "a:folder:f"]);
  const open = globalSessionRows([e(a, "a2")], { a: { f: true } }, {}, true);
  expect(keys(open)).toContain("a:session:a2");
});
