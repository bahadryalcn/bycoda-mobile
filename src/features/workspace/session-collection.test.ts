import { describe, expect, it } from "vitest";
import type { HostProjectDirectory, HostSessionSummary } from "@/domain/types";
import { filterProjectSessionDirectory, sessionShelfRows } from "./session-collection";

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
  it("groups sessions into needs-you, running and recent shelves in directory order", () => {
    const rows = sessionShelfRows([
      { project: projects[0]!, session: { ...session("one", "reply"), needsInput: true } },
      ...directory.slice().reverse(),
    ]);
    expect(rows.map((row) => row.key)).toEqual([
      "shelf:needs", "one:reply", "shelf:running", "two:two-running", "shelf:recent", "two:two-idle", "one:one-idle",
    ]);
    expect(rows[0]).toMatchObject({ kind: "header", count: 1, expanded: true });
  });
  it("hides collapsed shelf members but expands them while searching, and shows one archive shelf", () => {
    expect(sessionShelfRows(directory, { recent: true }).map((row) => row.key)).toEqual([
      "shelf:running", "two:two-running", "shelf:recent"]);
    expect(sessionShelfRows(directory, { recent: true }, true)).toHaveLength(5);
    expect(sessionShelfRows(directory, {}, false, true).filter((row) => row.kind === "header")
      .map((row) => row.key)).toEqual(["shelf:archived"]);
    expect(sessionShelfRows([])).toEqual([]);
  });
  it("finds names and folder paths while retaining activity order for the flat active-session view", () => {
    expect(filterProjectSessionDirectory(projects, directory, "G:/Shared")).toEqual(directory);
    expect(filterProjectSessionDirectory(projects, directory, "Project two").map((row) => row.session.id))
      .toEqual(["two-idle", "two-running"]);
    expect(filterProjectSessionDirectory(projects, directory, "Folder two").map((row) => row.session.id))
      .toEqual(["two-idle"]);
  });
});
