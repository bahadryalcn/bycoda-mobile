import { expect, it } from "vitest";
import { globalSessionRows, recentGlobalSessionRows, urgencyGlobalSessionRows, type SessionSectionRow } from "./global-session-shelves";

const layout = (folders: object[]) => ({ folders, order: { pinned: [], loose: [] } });
const folder = (id: string, sessionIds: string[], extra: object = {}) =>
  ({ id, name: id, sessionIds, collapsed: false, pinned: false, ordered: false, ...extra });
const p = (id: string, folders: object[] = []) =>
  ({ id, name: id, cwd: `/${id}`, sessionLayout: folders.length ? layout(folders) : undefined }) as never;
const e = (project: never, id: string, extra: object = {}) =>
  ({ project, session: { id, title: id, status: "idle", updatedAt: 1, ...extra } }) as never;
const keys = (rows: readonly SessionSectionRow[]) =>
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

it("sections all projects into Pinned, Needs you, Working, Recent and a folded Settled shelf", async () => {
  const { sessionSectionRows } = await import("./global-session-shelves");
  const a = p("a"), b = p("b");
  const directory = [
    e(a, "old", { updatedAt: 1 }), e(b, "new", { updatedAt: 5 }), e(a, "pin", { pinned: true, updatedAt: 2 }),
    e(b, "ask", { needsInput: true, updatedAt: 3 }), e(a, "run", { status: "running", updatedAt: 4 }), e(b, "done", { updatedAt: 6 }),
  ];
  const settledIds = new Set(["done"]);
  const rows = sessionSectionRows(directory, { settledIds, now: 10 });
  expect(keys(rows)).toEqual(["pinned:1", "a:pin", "needs:1", "b:ask", "running:1", "a:run", "recent:2", "b:new", "a:old", "settled:1"]);
  // An explicit choice wins over the default and search opens every shelf.
  expect(keys(sessionSectionRows(directory, { settledIds, now: 10, collapsed: { "shelf:settled": false, "shelf:recent": true } })))
    .toEqual(["pinned:1", "a:pin", "needs:1", "b:ask", "running:1", "a:run", "recent:2", "settled:1", "b:done"]);
  expect(keys(sessionSectionRows(directory, { settledIds, now: 10, searching: true, collapsed: { "shelf:recent": true } }))).toContain("b:done");
});

it("keeps quiet history inside the seven-day window and fills the archive view", async () => {
  const { sessionSectionRows } = await import("./global-session-shelves");
  const a = p("a"), day = 86_400_000, now = 30 * day;
  const directory = [e(a, "stale", { updatedAt: now - 9 * day }), e(a, "fresh", { updatedAt: now - day }), e(a, "ask", { needsInput: true, updatedAt: 1 })];
  expect(keys(sessionSectionRows(directory, { now, windowed: true }))).toEqual(["needs:1", "a:ask", "recent:1", "a:fresh"]);
  expect(keys(sessionSectionRows(directory, { now, archived: true }))).toEqual(["archived:3", "a:fresh", "a:stale", "a:ask"]);
});

it("leads a tablet urgency section with failures", async () => {
  const { sessionSectionRows } = await import("./global-session-shelves");
  const a = p("a");
  const directory = [e(a, "new", { updatedAt: 3 }), e(a, "failed", { issue: "failed", updatedAt: 1 })];
  expect(keys(sessionSectionRows(directory, { now: 10 }))).toEqual(["recent:2", "a:new", "a:failed"]);
  expect(keys(sessionSectionRows(directory, { now: 10, urgency: true }))).toEqual(["recent:2", "a:failed", "a:new"]);
});

it("groups by project under Pinned, ordering projects by activity and rows urgency-first", async () => {
  const { projectGroupedSessionRows } = await import("./global-session-shelves");
  const a = p("a"), b = p("b");
  const directory = [
    e(a, "a-old", { updatedAt: 1 }), e(a, "a-ask", { needsInput: true, updatedAt: 2 }), e(a, "a-settled", { updatedAt: 3 }),
    e(b, "b-new", { updatedAt: 9 }), e(b, "b-run", { status: "running", updatedAt: 4 }), e(a, "a-pin", { pinned: true, updatedAt: 8 }),
  ];
  const settledIds = new Set(["a-settled"]);
  const rows = projectGroupedSessionRows(directory, { settledIds, now: 10 });
  expect(rows.map((row) => row.kind === "project" ? `project:${row.project.id}:${row.count}` : row.kind === "header" ? `${row.shelf}:${row.count}` : row.key))
    .toEqual(["pinned:1", "a:a-pin", "project:b:2", "b:b-run", "b:b-new", "project:a:3", "a:a-ask", "a:a-old", "a:a-settled"]);
  const folded = projectGroupedSessionRows(directory, { settledIds, now: 10, collapsed: { "project:b": true, "shelf:pinned": true } });
  expect(folded.map((row) => row.key)).toEqual(["shelf:pinned", "project:b", "project:a", "a:a-ask", "a:a-old", "a:a-settled"]);
  // A folded group still reports its runs in flight, so its header can show activity.
  expect(folded.flatMap((row) => row.kind === "project" ? [`${row.project.id}:${row.running}`] : [])).toEqual(["b:1", "a:0"]);
  expect(projectGroupedSessionRows(directory, { settledIds, now: 10, searching: true, collapsed: { "project:b": true } })
    .map((row) => row.key)).toContain("b:b-new");
});

it("opens the snooze view and a lone settled shelf instead of showing only a folded header", async () => {
  const { sessionSectionRows } = await import("./global-session-shelves");
  const a = p("a");
  const snoozed = [e(a, "z", { snoozedUntil: 100, updatedAt: 1 })];
  expect(keys(sessionSectionRows(snoozed, { now: 10, snoozed: true }))).toEqual(["snoozed:1", "a:z"]);
  // A filter that leaves only settled history opens it; a stored fold still wins.
  const settledIds = new Set(["s"]);
  expect(keys(sessionSectionRows([e(a, "s")], { now: 10, settledIds }))).toEqual(["settled:1", "a:s"]);
  expect(keys(sessionSectionRows([e(a, "s")], { now: 10, settledIds, collapsed: { "shelf:settled": true } }))).toEqual(["settled:1"]);
  expect(keys(sessionSectionRows([e(a, "s"), e(a, "r")], { now: 10, settledIds }))).toEqual(["recent:1", "a:r", "settled:1"]);
});

it("reveals the selected session's folded section without changing the stored choice", async () => {
  const { sessionSectionRows, projectGroupedSessionRows, sectionKeyOf } = await import("./global-session-shelves");
  const a = p("a");
  const settledIds = new Set(["s"]);
  const directory = [e(a, "s"), e(a, "r")];
  const rows = sessionSectionRows(directory, { now: 10, settledIds, reveal: "s", collapsed: { "shelf:settled": true } });
  expect(keys(rows)).toEqual(["recent:1", "a:r", "settled:1", "a:s"]);
  expect(sectionKeyOf(rows, "s")).toBe("shelf:settled");
  const grouped = projectGroupedSessionRows(directory, { now: 10, settledIds, reveal: "r", collapsed: { "project:a": true } });
  expect(grouped.map((row) => row.key)).toEqual(["project:a", "a:r", "a:s"]);
  expect(sectionKeyOf(grouped, "r")).toBe("project:a");
});
