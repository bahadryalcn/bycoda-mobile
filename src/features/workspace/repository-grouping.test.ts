import { expect, it } from "vitest";
import { groupProjectsByRepository, repositoryRoots } from "./repository-grouping";

type TestProject = { id: string; cwd: string; name: string; groupId?: string; pinned?: boolean };
const project = (id: string, cwd: string, extra: Partial<TestProject> = {}): TestProject => ({ id, cwd, name: cwd.split("/").pop()!, ...extra });

it("maps worktree folder layouts to the repository root", () => {
  const roots = repositoryRoots([
    project("a", "/w/app"),
    project("b", "/w/app/.worktrees/feat"),
    project("c", "/w/app.worktrees/fix"),
    project("d", "/w/app-worktrees/other"),
    project("e", "/w/app/.claude/worktrees/x"),
    project("f", "/w/lib"),
  ]);
  expect([...roots.values()]).toEqual(["/w/app", "/w/app", "/w/app", "/w/app", "/w/app", "/w/lib"]);
});

it("groups repositories with several projects and leaves singles ungrouped", () => {
  const result = groupProjectsByRepository([
    project("a", "/w/app", { groupId: "desktop" }),
    project("b", "/w/app/.worktrees/feat"),
    project("f", "/w/lib", { pinned: true }),
  ]);
  expect(result.groups).toEqual([{ id: "repo:/w/app", name: "app" }]);
  expect(result.projects.map((item) => item.groupId)).toEqual(["repo:/w/app", "repo:/w/app", undefined]);
  expect(result.projects[2]!.pinned).toBe(true);
});

it("names a group after its root folder when the root project is not listed and folds Windows case", () => {
  const result = groupProjectsByRepository([project("a", "C:/Code/App.worktrees/a"), project("b", "c:/code/app.worktrees/b")]);
  expect(result.groups).toHaveLength(1);
  expect(result.groups[0]!.name).toBe("app");
  expect(roots(result.projects)).toEqual(["repo:c:/code/app", "repo:c:/code/app"]);
});
function roots(list: { groupId?: string }[]) { return list.map((item) => item.groupId); }

it("joins a project nested in another listed project", () => {
  const result = groupProjectsByRepository([project("a", "/w/mono"), project("b", "/w/mono/packages/x")]);
  expect(result.projects.map((item) => item.groupId)).toEqual(["repo:/w/mono", "repo:/w/mono"]);
});
