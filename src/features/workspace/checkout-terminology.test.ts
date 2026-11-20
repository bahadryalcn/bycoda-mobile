import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogs, LANGUAGES } from "../../localization";

// Mobile copy is inline (copy(turkish, english)), so the checkout vocabulary is pinned by source.
// Turkish uses "çalışma ağacı" for a Git worktree and "çalışma klasörü" for the working folder,
// matching the desktop catalog. Wire IDs (RPC method names) must never change with the labels.
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const checkoutSurfaces = [
  "features/workspace/project-screen.tsx",
  "features/workspace/session-list-row.tsx",
  "features/workspace/session-options-menu.tsx",
  "features/workspace/git-actions-model.ts",
  "features/workspace/worktree-create.tsx",
  "features/workspace/worktree-create-review.tsx",
  "features/workspace/worktree-removal.tsx",
  "features/workspace/worktree-removal-review.tsx",
  "features/management/tasks/task-editor.tsx",
  "features/management/tasks/delivery-editor.tsx",
];

const retiredLabels = [
  "Ayrı çalışma klasörü",
  "Worktree oluştur",
  "Başka worktree oluştur",
  "Çalışma klasörü kaldırma",
  "Dallar ve çalışma klasörleri",
  "Checkout folder (optional)",
  "Target checkout",
  "Hedef klasör\", \"Target",
];

describe("mobile checkout terminology", () => {
  it.each(checkoutSurfaces)("%s no longer ships retired checkout labels", (path) => {
    const text = source(path);
    for (const label of retiredLabels) expect(text).not.toContain(label);
  });

  it("keeps Turkish worktree and working-folder terms consistent in the catalog", () => {
    expect(catalogs.tr["Worktree"]).toBe("Çalışma ağacı");
    expect(catalogs.tr["Create worktree"]).toBe("Çalışma ağacı oluştur");
    expect(catalogs.tr["Create another worktree"]).toBe("Başka çalışma ağacı oluştur");
    expect(catalogs.tr["Worktree removal"]).toBe("Çalışma ağacı kaldırma");
    expect(catalogs.tr["Working folder (optional)"]).toBe("Çalışma klasörü (isteğe bağlı)");
    expect(catalogs.tr["Target working folder"]).toBe("Hedef çalışma klasörü");
  });

  it("renames the checkout keys in every shipped catalog", () => {
    for (const { value } of LANGUAGES) {
      expect(catalogs[value]["Working folder (optional)"]).toBeTruthy();
      expect(catalogs[value]["Target working folder"]).toBeTruthy();
      expect(catalogs[value]["Checkout folder (optional)"]).toBeUndefined();
      expect(catalogs[value]["Target checkout"]).toBeUndefined();
    }
  });

  it("keeps raw wire identifiers unchanged while labels move", () => {
    expect(source("features/workspace/project-screen.tsx")).toContain("git.worktreeCreate");
    expect(source("features/workspace/worktree-removal.tsx")).toContain("worktrees.removal.review");
    expect(source("features/workspace/worktree-removal.tsx")).toContain("worktrees.removal.approve");
  });
});
