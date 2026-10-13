import { describe, expect, it } from "vitest";
import { isProjectWorkspaceQuery } from "./project-cache";

describe("workspace mutation cache scope", () => {
  it("refreshes file, content search, branch and diff data after a working-tree change", () => {
    for (const name of ["git", "diff", "branches", "worktrees", "files", "file", "file-content"]) {
      expect(
        isProjectWorkspaceQuery(
          ["machine", "pc-a", name, "project", "worktree", { cwd: "worktree" }],
          "pc-a",
          "project",
        ),
      ).toBe(true);
    }
  });

  it("never invalidates another computer, another project, or unrelated machine management data", () => {
    expect(isProjectWorkspaceQuery(["machine", "pc-b", "file", "project"], "pc-a", "project")).toBe(
      false,
    );
    expect(isProjectWorkspaceQuery(["machine", "pc-a", "file", "other"], "pc-a", "project")).toBe(
      false,
    );
    expect(
      isProjectWorkspaceQuery(["machine", "pc-a", "tasks", "project"], "pc-a", "project"),
    ).toBe(false);
    expect(isProjectWorkspaceQuery(["machine", null, "file", "project"], null, "project")).toBe(
      false,
    );
  });
});
