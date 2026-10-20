import { describe, expect, it } from "vitest";
import {
  directorySections,
  distinctDirectoryProjects,
  directoryRows,
  projectPathLabel,
  sortDirectoryProjects,
  type DirectoryProject,
} from "./project-directory";

describe("complete project directory", () => {
  const projects: DirectoryProject[] = Array.from({ length: 80 }, (_, index) => ({
    id: `p${index}`,
    cwd: index < 2 ? "G:/Shared" : `G:/Projects/${index}`,
    name: `Project ${index}`,
    registered: true,
    ...(index < 40 ? { groupId: "work" } : {}),
  }));
  const groups = [{ id: "work", name: "Work", collapsed: false }];
  it("keeps every distinct host ID, including aliases and projects beyond32", () => {
    expect(distinctDirectoryProjects([...projects, projects[0]!])).toHaveLength(80);
    expect(
      directorySections(projects, groups, "", {}).reduce((sum, section) => sum + section.total, 0),
    ).toBe(80);
  });
  it("collapse does not alter totals and searching expands matching projects", () => {
    const collapsed = directorySections(projects, groups, "", { work: true });
    expect(collapsed[0]).toMatchObject({ count: 40, total: 40, expanded: false, data: [] });
    const search = directorySections(projects, groups, "Project 39", { work: true });
    expect(search[0]).toMatchObject({ count: 1, total: 40, expanded: true });
    expect(search[0]?.data[0]?.id).toBe("p39");
  });
  it("searches group names and ungrouped paths across the full directory", () => {
    expect(directorySections(projects, groups, "work", {})[0]?.data).toHaveLength(40);
    expect(directorySections(projects, groups, "G:/Projects/79", {})[0]?.data[0]?.id).toBe("p79");
  });
  it("virtualizes every project separately and preserves group boundaries", () => {
    const rows = directoryRows(directorySections(projects, groups, "", {}), true);
    expect(rows.filter((row) => row.kind === "project")).toHaveLength(80);
    expect(rows.filter((row) => row.kind === "group")).toHaveLength(2);
    expect(rows[1]).toMatchObject({ kind: "project", first: true, last: false });
    expect(rows[40]).toMatchObject({ kind: "project", first: false, last: true });
    expect(directoryRows(directorySections(projects, groups, "", { work: true }), true).filter((row) => row.kind === "project")).toHaveLength(40);
  });
  it("sorts names naturally and recents by host ID without combining aliases", () => {
    const values = [{ id: "a", name: "Project 10" }, { id: "b", name: "Project 2" }, { id: "c", name: "Project 2" }];
    expect(sortDirectoryProjects(values, { sort: "name", recent: {} }).map((row) => row.id)).toEqual(["b", "c", "a"]);
    expect(sortDirectoryProjects(values, { sort: "recent", recent: { c: 20, a: 10 } }).map((row) => row.id)).toEqual(["c", "a", "b"]);
    expect(sortDirectoryProjects(values, { sort: "desktop", recent: { c: 20 } })).toEqual(values);
    expect(values[0]?.id).toBe("a");
  });
  it("keeps folder identities readable while allowing the complete path", () => {
    expect(projectPathLabel("G:\\Projects\\Firisbe\\Captcha")).toBe("…/Firisbe/Captcha");
    expect(projectPathLabel("/Users/owner/code/project", true)).toBe("/Users/owner/code/project");
    expect(projectPathLabel("/project")).toBe("/project");
  });
});
