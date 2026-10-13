import { describe, expect, it } from "vitest";
import {
  filesReducer,
  gitReducer,
  initialGitState,
  projectViewReducer,
  type GitConfirmation,
} from "./workspace-state";

describe("workspace view transitions", () => {
  it("replaces a file operation when opening an editor and clears search on folder navigation", () => {
    const editing = filesReducer(
      { path: "docs", search: "old", searchMode: "names", view: { kind: "create" } },
      { type: "view", view: { kind: "edit", path: "docs/README.md" } },
    );
    expect(editing.view).toEqual({ kind: "edit", path: "docs/README.md" });
    expect(filesReducer(editing, { type: "navigate", path: "" })).toEqual({
      path: "",
      search: "",
      searchMode: "names",
      view: { kind: "browse" },
    });
  });
  it("changes worktree without carrying the previous file editor into another scope", () => {
    const next = projectViewReducer(
      { segment: "files", cwd: "/demo/a", file: "secret.ts", pickingWorktree: true },
      { type: "worktree", cwd: "/demo/b" },
    );
    expect(next).toEqual({ segment: "files", cwd: "/demo/b", pickingWorktree: false });
  });
  it("keeps a newly opened editor when an older file creation completes", () => {
    const creating = { kind: "create" } as const;
    const current = filesReducer(
      { path: "", search: "", searchMode: "names", view: creating },
      { type: "view", view: { kind: "edit", path: "new.ts" } },
    );
    expect(filesReducer(current, { type: "completed", view: creating })).toBe(current);
  });
  it("allows one Git confirmation and ignores a late completion for a replaced dialog", () => {
    const old: GitConfirmation = { kind: "discard", path: "a.ts" };
    const current: GitConfirmation = { kind: "switch", branch: "feature/new" };
    const state = gitReducer(gitReducer(initialGitState, { type: "confirm", confirmation: old }), {
      type: "confirm",
      confirmation: current,
    });
    expect(gitReducer(state, { type: "completed", confirmation: old })).toBe(state);
    expect(gitReducer(state, { type: "completed", confirmation: current })).toEqual(
      initialGitState,
    );
  });
  it("does not let an older staging response close a different file diff", () => {
    const state = gitReducer(initialGitState, {
      type: "view",
      view: { kind: "diff", selection: { path: "b.ts", staged: false } },
    });
    expect(gitReducer(state, { type: "staged", path: "a.ts" })).toBe(state);
    expect(gitReducer(state, { type: "staged", path: "b.ts" })).toEqual(initialGitState);
  });
  it("clears pending Git confirmation when the user moves to another view", () => {
    const state = gitReducer(initialGitState, {
      type: "confirm",
      confirmation: { kind: "commit" },
    });
    expect(gitReducer(state, { type: "view", view: { kind: "branches" } })).toEqual({
      view: { kind: "branches" },
      confirmation: null,
    });
  });
});
