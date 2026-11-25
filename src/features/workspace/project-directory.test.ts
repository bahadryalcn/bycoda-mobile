import { describe, expect, it } from "vitest";
import {
  directorySections,
  distinctDirectoryProjects,
  directoryRows,
  nestDirectoryProjects,
  projectNameContexts,
  projectPathLabel,
  PINNED_SECTION_KEY,
  sortDirectoryProjects,
  projectSortOf,
  projectAttentionCounts,
  latestProjectSessions,
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
  it("keeps desktop order when projects run while retaining counts inside collapsed groups", () => {
    const counts = { p60: 2 };
    expect(sortDirectoryProjects(projects, { sort: "desktop", recent: {} })[0]?.id).toBe("p0");
    const sections = directorySections(projects, groups, "", { "": true }, counts);
    expect(sections.map((section) => section.key)).toEqual(["work", ""]);
    expect(sections[1]).toMatchObject({ key: "", running: 2, expanded: false, data: [] });
    expect(directorySections(projects, groups, "Project 0", {}, counts).every((section) => section.running === 0)).toBe(true);
  });
  it("shows desktop pins first, as the rail's Pinned section, without moving grouped projects", () => {
    const pinned = projects.map((project) =>
      project.id === "p70" || project.id === "p5" ? { ...project, pinned: true } : project);
    for (const sort of ["desktop", "name", "recent"] as const)
      expect(sortDirectoryProjects(pinned, { sort, recent: { p0: 100 } }).slice(0, 2).map((row) => row.id))
        .toEqual(["p5", "p70"]);
    // The retired phone-only custom order now reads as the computer order.
    expect(sortDirectoryProjects(pinned, { sort: "custom" as never, recent: {} })[0]?.id).toBe("p5");
    const sections = directorySections(pinned, groups, "", {});
    expect(sections.map((section) => section.key)).toEqual([PINNED_SECTION_KEY, "work", ""]);
    expect(sections[0]).toMatchObject({ pinned: true, total: 1, data: [{ id: "p70" }] });
    expect(sections[1]?.total).toBe(40);
    expect(directorySections(pinned, groups, "Project 1", {}).map((section) => section.key)).not.toContain(PINNED_SECTION_KEY);
  });
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

describe("nested project folders", () => {
  it("keeps case-sensitive POSIX paths distinct when finding parent folders", () => {
    const projects = [{ id: "upper", cwd: "/home/owner/Repo" }, { id: "lower-child", cwd: "/home/owner/repo/mobile" }];
    expect(nestDirectoryProjects(projects)).toEqual(projects.map(project => ({ project, depth: 0 })));
  });
  it("keeps independently registered nested repositories at the same level and in computer order", () => {
    const projects = [
      { id: "mobile", cwd: "G:/Repo/mobile", registered: true },
      { id: "repo", cwd: "G:/Repo", registered: true },
      { id: "other", cwd: "G:/Other", registered: true },
    ];
    expect(nestDirectoryProjects(projects)).toEqual(projects.map(project => ({ project, depth: 0 })));
  });
  it("places a project folder under its closest parent project", () => {
    const rows = nestDirectoryProjects([
      { id: "c", cwd: "G:\\Repo\\pkg\\core" },
      { id: "a", cwd: "G:/Repo" },
      { id: "x", cwd: "G:/Other" },
      { id: "b", cwd: "G:/Repo/pkg" },
      { id: "same", cwd: "g:/repo/" },
    ]);
    expect(rows.map((row) => `${row.project.id}:${row.depth}`)).toEqual(["a:0", "b:1", "c:2", "x:0", "same:0"]);
  });
});

describe("same-name projects", () => {
  it("adds the parent folder only to names another folder shares, case-insensitively", () => {
    expect(projectNameContexts([
      { id: "a", name: "app", cwd: "C:\\code\\work\\app" },
      { id: "b", name: "App ", cwd: "/home/me/side/app" },
      { id: "c", name: "api", cwd: "/home/me/side/api" },
    ])).toEqual({ a: "work", b: "side" });
  });
  it("treats spellings of one folder as one project and skips drive roots", () => {
    expect(projectNameContexts([
      { id: "a", name: "app", cwd: "C:\\code\\app" },
      { id: "b", name: "app", cwd: "c:/code/app/" },
    ])).toEqual({});
    expect(projectNameContexts([
      { id: "a", name: "data", cwd: "D:\\data" },
      { id: "b", name: "data", cwd: "E:/backup/data" },
    ])).toEqual({ b: "backup" });
  });
});

describe("project sort choices", () => {
  const rows = [
    { id: "b", name: "Beta" },
    { id: "a", name: "alpha", pinned: true },
    { id: "c", name: "Gamma" },
    { id: "d", name: "Delta" },
  ];
  const ids = (list: readonly { id: string }[]) => list.map((row) => row.id);
  it("keeps the computer order with pinned first, and maps the retired custom order to it", () => {
    expect(ids(sortDirectoryProjects(rows, { sort: "desktop", recent: {} }))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortDirectoryProjects(rows, { sort: "custom" as never, recent: {} }))).toEqual(["a", "b", "c", "d"]);
    expect(projectSortOf("custom")).toBe("desktop");
  });
  it("sorts by name A-Z and by the latest session activity or phone opening", () => {
    expect(ids(sortDirectoryProjects(rows, { sort: "name", recent: {} }))).toEqual(["a", "b", "d", "c"]);
    expect(ids(sortDirectoryProjects(rows, { sort: "recent", recent: { d: 50 } }, { c: 100, b: 10 }))).toEqual(["a", "c", "d", "b"]);
  });
  it("counts needs-you sessions and picks the latest live session per project", () => {
    const directory = [
      { project: { id: "p" }, session: { id: "s1", needsInput: true, lastActivityAt: 5 } },
      { project: { id: "p" }, session: { id: "s2", lastActivityAt: 9 } },
      { project: { id: "p" }, session: { id: "s3", needsInput: true, archived: true, lastActivityAt: 20 } },
    ];
    expect(projectAttentionCounts(directory)).toEqual({ p: 1 });
    expect(latestProjectSessions(directory)).toEqual({ p: "s2" });
  });
});
