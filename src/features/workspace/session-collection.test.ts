import { describe, expect, it } from "vitest";
import type { HostProjectDirectory, HostSessionSummary } from "@/domain/types";
import { filterProjectSessionDirectory, projectSessionCollectionRows, sessionCollectionScope } from "./session-collection";

type Project = HostProjectDirectory["projects"][number];
const projects: Project[] = ["one", "two"].map((id) => ({
  id, name: `Project ${id}`, cwd: "G:/Shared", registered: true,
  sessionLayout: { order: {}, folders: [{ id: "folder", name: `Folder ${id}`, sessionIds: [`${id}-idle`], collapsed: false }] },
}));
const session = (projectId: string, id: string, status: HostSessionSummary["status"] = "idle"): HostSessionSummary =>
  ({ id, projectId, title: id, harness: "codex", revision: 1, updatedAt: 1, status });
const directory = [
  { project: projects[0]!, session: session("one", "one-idle") },
  { project: projects[1]!, session: session("two", "two-idle") },
  { project: projects[1]!, session: session("two", "two-running", "running") },
];

describe("all-project session collection", () => {
  it("promotes whole running project sections and keeps nested rows in their own project", () => {
    const rows = projectSessionCollectionRows(projects, directory, "machine");
    expect(rows.map((row) => row.key)).toEqual([
      "project:two", "two:session:two-running", "two:folder:folder", "two:session:two-idle",
      "project:one", "one:folder:folder", "one:session:one-idle",
    ]);
    expect(rows[0]).toMatchObject({ kind: "project", count: 2, running: 1 });
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
  it("keeps host IDs distinct for aliases and scopes project/folder collapse to the selected machine", () => {
    const projectScope = sessionCollectionScope("machine", "one");
    const folderScope = sessionCollectionScope("machine", "two");
    const folders = { [folderScope]: { folder: true } };
    const collapsed = { [projectScope]: true };
    const rows = projectSessionCollectionRows(projects, directory, "machine", folders, collapsed);
    expect(rows.find((row) => row.key === "project:one")).toMatchObject({ expanded: false, count: 1 });
    expect(rows.find((row) => row.key === "two:folder:folder")).toMatchObject({ expanded: false, count: 1 });
    expect(rows.filter((row) => row.kind === "session").map((row) => row.key)).toEqual(["two:session:two-running"]);
    expect(projectSessionCollectionRows(projects, directory, "other", folders, collapsed).filter((row) => row.kind === "session")).toHaveLength(3);
  });
  it("temporarily expands project and folder ancestors during search without editing collapse preferences", () => {
    const scope = sessionCollectionScope("machine", "one");
    const folders = { [scope]: { folder: true } };
    const collapsed = { [scope]: true };
    const matching = filterProjectSessionDirectory(projects, directory, "Folder one");
    const rows = projectSessionCollectionRows(projects, matching, "machine", folders, collapsed, true);
    expect(rows.map((row) => row.key)).toEqual(["project:one", "one:folder:folder", "one:session:one-idle"]);
    expect(rows[0]).toMatchObject({ count: 1, expanded: true });
    expect(rows[1]).toMatchObject({ expanded: true });
    expect(folders).toEqual({ [scope]: { folder: true } });
    expect(collapsed).toEqual({ [scope]: true });
  });
  it("finds names and folder paths while retaining activity order for the flat active-session view", () => {
    expect(filterProjectSessionDirectory(projects, directory, "G:/Shared")).toEqual(directory);
    expect(filterProjectSessionDirectory(projects, directory, "Project two").map((row) => row.session.id))
      .toEqual(["two-idle", "two-running"]);
    expect(filterProjectSessionDirectory(projects, directory, "Folder two").map((row) => row.session.id))
      .toEqual(["two-idle"]);
    expect(projectSessionCollectionRows(projects, [], "machine")).toEqual([]);
  });
});
