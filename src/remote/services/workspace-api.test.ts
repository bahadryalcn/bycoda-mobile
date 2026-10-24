import { expect, it, vi } from "vitest";
import { createWorkspaceApi } from "./workspace-api";
import { readonlyRequest } from "../request-policy";
import type { HostRequest } from "../types";
it("pins creation to the selected source checkout and disables transport retry", async () => {
  const request = vi.fn(async () => ({}));
  const api = createWorkspaceApi(request as HostRequest);
  await api.git.createWorktree({ projectId: "p", cwd: "/selected" }, "feature", "origin/main", false, { retry: true });
  expect(request).toHaveBeenCalledExactlyOnceWith("git.worktreeCreate", { projectId: "p", cwd: "/selected", branch: "feature", base: "origin/main", existing: false }, { retry: false });
  expect(readonlyRequest("git.worktreeCreate", {})).toBe(false);
  expect(readonlyRequest("workspace.run", { command: "git_submodules", args: { cwd: "/selected" } })).toBe(true);
});
