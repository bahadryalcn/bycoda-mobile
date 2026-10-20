import { describe, expect, it } from "vitest";
import type { HostSessionSummary } from "@/domain/types";
import { sessionDirectoryRows, toggleSessionDirectoryFolder, type SessionLayout } from "./session-directory";

const session = (id: string, updatedAt: number, extra: Partial<HostSessionSummary> = {}): HostSessionSummary =>
  ({ id, updatedAt, projectId: "p", revision: 1, status: "idle", title: id, harness: "codex", ...extra });
const sessions = [session("one", 10), session("two", 20), session("three", 30), session("four", 40)];
const layout: SessionLayout = {
  folders: [{ id: "parent", name: "Parent", sessionIds: ["one"], collapsed: true },
    { id: "child", name: "Child", parentId: "parent", sessionIds: ["two"], collapsed: false }],
  order: { loose: ["three", "four"] },
};

describe("mobile session organization", () => {
  it("retains offscreen folder membership and applies new manual metadata without rewriting filtered order", () => {
    const many = Array.from({ length: 90 }, (_, index) => session(`s${index}`, index));
    const ids = many.slice(0, 60).map((value) => value.id);
    const organized: SessionLayout = { folders: [
      { id: "parent", name: "Parent", sessionIds: [], collapsed: true },
      { id: "child", name: "Child", parentId: "parent", sessionIds: ids, ordered: true, collapsed: true },
    ], order: { loose: many.slice(60).map((value) => value.id).reverse() } };
    const before = JSON.stringify(organized);
    const normal = sessionDirectoryRows(many, organized);
    expect(normal[0]).toMatchObject({ count: 60, expanded: false });
    expect(normal.filter((row) => row.kind === "session")).toHaveLength(30);
    const filtered = many.filter((_, index) => index % 2 === 0);
    const rows = sessionDirectoryRows(filtered, organized, {}, true);
    expect(rows.filter((row) => row.kind === "session")).toHaveLength(45);
    expect(rows[0]).toMatchObject({ count: 30, expanded: true });
    expect(rows[1]).toMatchObject({ count: 30, expanded: true });
    const reordered = { ...organized, folders: organized.folders.map((folder) => ({ ...folder, sessionIds: [...folder.sessionIds].reverse() })) };
    expect(sessionDirectoryRows(filtered, reordered, {}, true).filter((row) => row.kind === "session").slice(0, 3).map((row) => row.key))
      .toEqual(["session:s58", "session:s56", "session:s54"]);
    expect(JSON.stringify(organized)).toBe(before);
    expect(sessionDirectoryRows(many, organized)).toEqual(normal);
  });
  it("keeps saved nested collapse choices when a folder is tapped during search", () => {
    const collapsed = { parent: false, child: true };
    const rows = sessionDirectoryRows(sessions, layout, collapsed, true);
    const parent = rows[0];
    if (!parent || parent.kind !== "folder") throw new Error("Expected search parent");
    const afterParentTap = toggleSessionDirectoryFolder(collapsed, parent, true);
    expect(afterParentTap.parent).toBe(false);
    const child = rows.find((row) => row.kind === "folder" && row.folder.id === "child");
    if (!child || child.kind !== "folder") throw new Error("Expected expanded search child");
    const afterTap = toggleSessionDirectoryFolder(collapsed, child, true);
    expect(afterTap).toBe(collapsed);
    expect(sessionDirectoryRows(sessions, layout, afterTap)).toEqual(sessionDirectoryRows(sessions, layout, collapsed));
    expect(toggleSessionDirectoryFolder(collapsed, parent, true)).toBe(collapsed);
    expect(toggleSessionDirectoryFolder(collapsed, parent, false)).toEqual({ parent: true, child: true });
  });
  it("matches the desktop tree by omitting folders with no currently visible members", () => {
    const empty: SessionLayout = { folders: [
      { id: "empty", name: "Empty", sessionIds: [], collapsed: false },
      { id: "filtered", name: "Filtered", sessionIds: ["hidden"], collapsed: false },
      { id: "parent", name: "Parent", sessionIds: [], collapsed: false },
      { id: "child", name: "Child", parentId: "parent", sessionIds: [], collapsed: false },
    ], order: {} };
    expect(sessionDirectoryRows(sessions, empty).every((row) => row.kind === "session")).toBe(true);
    expect(sessionDirectoryRows([], empty)).toEqual([]);
    expect(sessionDirectoryRows([], empty, {}, true)).toEqual([]);
  });
  it("shows collapsed folder counts without leaking their members into the loose list", () => {
    expect(sessionDirectoryRows(sessions, layout).map((row) => row.key)).toEqual(["folder:parent", "session:three", "session:four"]);
    expect(sessionDirectoryRows(sessions, layout)[0]).toMatchObject({ count: 2, expanded: false });
  });
  it("expands nested folders on search and keeps every session separately virtualized", () => {
    const rows = sessionDirectoryRows(sessions, layout, {}, true);
    expect(rows.map((row) => row.key)).toEqual(["folder:parent", "folder:child", "session:two", "session:one", "session:three", "session:four"]);
    expect(rows[2]).toMatchObject({ depth: 2 });
    expect(sessionDirectoryRows(sessions, layout, { parent: false })).toEqual(rows);
  });
  it("uses desktop manual order, puts new sessions first, and lets live status lead ties", () => {
    const items = [...sessions.slice(2), session("fresh", 1)];
    expect(sessionDirectoryRows(items, layout).map((row) => row.key)).toEqual(["session:fresh", "session:three", "session:four"]);
    expect(sessionDirectoryRows([session("three", 30), session("four", 40, { needsInput: true })], layout).map((row) => row.key))
      .toEqual(["session:four", "session:three"]);
  });
  it("recovers orphaned/cyclic folder metadata and renders duplicate membership only once", () => {
    const damaged: SessionLayout = { order: {}, folders: [
      { id: "a", name: "A", parentId: "b", collapsed: false, sessionIds: ["one"] },
      { id: "b", name: "B", parentId: "a", collapsed: false, sessionIds: ["one", "two"] },
    ] };
    const rows = sessionDirectoryRows(sessions, damaged);
    expect(rows.filter((row) => row.kind === "session")).toHaveLength(4);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
  it("keeps the legacy flat behavior on hosts without layout metadata", () => {
    expect(sessionDirectoryRows(sessions).map((row) => row.key)).toEqual(["session:four", "session:three", "session:two", "session:one"]);
  });
});
