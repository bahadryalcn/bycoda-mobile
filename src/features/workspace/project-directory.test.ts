import { describe, expect, it } from "vitest";
import {
  directorySections,
  distinctDirectoryProjects,
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
});
