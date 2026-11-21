import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  filesReducer,
  gitReducer,
  initialGitState,
  projectViewReducer,
  type GitConfirmation,
} from "./workspace-state";

describe("workspace view transitions", () => {
  it("retains the selected search line and exact browse context when returning from read-only inspection", () => {
    const previous = {
      path: "src",
      search: "needle",
      searchMode: "content",
      view: { kind: "browse" },
    } as const;
    const selected = filesReducer(previous, {
      type: "view",
      view: { kind: "edit", path: "src/a.ts", line: 450 },
    });
    expect(selected.view).toEqual({ kind: "edit", path: "src/a.ts", line: 450 });
    expect(filesReducer(selected, { type: "view", view: { kind: "browse" } })).toEqual(previous);
    expect(filesReducer(selected, { type: "navigate", path: "other" }).view).toEqual({
      kind: "browse",
    });
  });

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
  it("keeps the folder picker open until the guarded workspace change commits", () => {
    const screen = readFileSync(new URL("./project-screen.tsx", import.meta.url), "utf8");
    const picker = screen.slice(screen.indexOf("visible={worktreeOpen}"), screen.indexOf("<WorktreeCreate"));
    expect(picker).toContain("dismissible={!changingWorkspace}");
    expect(picker).toMatch(/onChange=\{\(value\) => \{\s*changeWorkspace\(\(\) => \{\s*dispatch\(\{ type: "worktree"[\s\S]*?setWorktreeOpen\(false\)/);
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

describe("opening a file from the changes list", () => {
  const start = { segment: "git", pickingWorktree: false } as const;
  it("returns to the changes list when the file closes", () => {
    const open = projectViewReducer(start, { type: "open-file", path: "a.ts" });
    expect(open).toMatchObject({ segment: "files", file: "a.ts", returnTo: "git" });
    expect(projectViewReducer(open, { type: "close-file" })).toMatchObject({ segment: "git", file: undefined, returnTo: undefined });
  });
  it("stays on files when the file was opened from files", () => {
    const open = projectViewReducer({ segment: "files", pickingWorktree: false }, { type: "open-file", path: "a.ts" });
    expect(projectViewReducer(open, { type: "close-file" }).segment).toBe("files");
  });
  it("forgets the return target when the segment changes", () => {
    const open = projectViewReducer(start, { type: "open-file", path: "a.ts" });
    const moved = projectViewReducer(open, { type: "segment", segment: "sessions" });
    expect(projectViewReducer(moved, { type: "close-file" }).segment).toBe("sessions");
  });
});
