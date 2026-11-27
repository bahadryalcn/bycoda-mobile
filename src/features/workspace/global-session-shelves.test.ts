import { expect, it } from "vitest";
import { globalSessionRows, recentGlobalSessionRows, urgencyGlobalSessionRows } from "./global-session-shelves";

const layout = (folders: object[]) => ({ folders, order: { pinned: [], loose: [] } });
const folder = (id: string, sessionIds: string[], extra: object = {}) =>
  ({ id, name: id, sessionIds, collapsed: false, pinned: false, ordered: false, ...extra });
const p = (id: string, folders: object[] = []) =>
  ({ id, name: id, cwd: `/${id}`, sessionLayout: folders.length ? layout(folders) : undefined }) as never;
const e = (project: never, id: string, extra: object = {}) =>
  ({ project, session: { id, title: id, status: "idle", updatedAt: 1, ...extra } }) as never;
const keys = (rows: ReturnType<typeof globalSessionRows>) =>
  rows.map((row) => (row.kind === "header" ? `${row.shelf}:${row.count}` : row.key));

it("orders attention, running and other sessions by activity within the seven-day window", () => {
  const a = p("a"), now = 30 * 86_400_000, day = 86_400_000;
  const directory = [e(a, "idle", { updatedAt: now }), e(a, "run", { status: "running", updatedAt: now - day }),
    e(a, "failed", { issue: "failed", updatedAt: now - 2 * day }), e(a, "input", { needsInput: true, updatedAt: now - day }),
    e(a, "old", { needsInput: true, updatedAt: now - 8 * day })];
  expect(keys(urgencyGlobalSessionRows(directory, now))).toEqual(["a:input", "a:failed", "a:old", "a:run", "a:idle"]);
  expect(directory[0]).toMatchObject({ session: { id: "idle" } });
});

it("shows global recents in activity order without pin or folder blocks hiding the newest session", () => {
  const a = p("a", [folder("f", ["old"])]);
  const b = p("b");
  const directory = [e(a, "old", { pinned: true, updatedAt: 1 }), e(b, "new", { updatedAt: 3 }), e(a, "middle", { updatedAt: 2 })];
  expect(keys(recentGlobalSessionRows(directory))).toEqual(["b:new", "a:middle", "a:old"]);
  expect(directory[0]).toMatchObject({ session: { id: "old" } });
});

it("orders and windows global recents by turn activity like desktop Last sessions", () => {
  const a = p("a");
  const day = 86_400_000;
  const now = 30 * day;
  const directory = [
    e(a, "renamed", { updatedAt: now, lastActivityAt: now - 3 * day }),
    e(a, "active", { updatedAt: now - 5 * day, lastActivityAt: now - day }),
    e(a, "stale", { updatedAt: now - 9 * day }),
    e(a, "pinned", { pinned: true, updatedAt: now - 20 * day }),
    e(a, "running", { status: "running", updatedAt: now - 21 * day }),
  ];
  // Pinned and running sessions are exempt from the window; only quiet history is trimmed.
  expect(keys(recentGlobalSessionRows(directory, now))).toEqual(["a:active", "a:renamed", "a:pinned", "a:running"]);
  expect(keys(recentGlobalSessionRows(directory))).toEqual(["a:active", "a:renamed", "a:stale", "a:pinned", "a:running"]);
});

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

it("leads one project's list with its pinned sessions under Pinned, then Recent, without repeating them", async () => {
  const { withPinnedGroup } = await import("./global-session-shelves");
  const project = { id: "p", name: "bycoda", cwd: "/p" } as never;
  const row = (id: string, pinned = false) => ({ kind: "session" as const, key: `p:${id}`, project, depth: 0,
    session: { id, pinned } as never });
  const rows = [row("new"), row("pin", true), row("old")];
  expect(withPinnedGroup(rows).map((entry) => entry.key)).toEqual(["shelf:pinned", "p:pin", "shelf:recent", "p:new", "p:old"]);
  expect(withPinnedGroup(rows, { pinned: true }).map((entry) => entry.key)).toEqual(["shelf:pinned", "shelf:recent", "p:new", "p:old"]);
  expect(withPinnedGroup([row("a"), row("b")]).map((entry) => entry.key)).toEqual(["p:a", "p:b"]);
});
