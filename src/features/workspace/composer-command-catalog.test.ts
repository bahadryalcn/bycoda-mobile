import { expect, it } from "vitest";
import { composerBuiltins, isComposerNavigationAction } from "./composer-command-catalog";

const copy = (_tr: string, en: string) => en;
const row = (rows: ReturnType<typeof composerBuiltins>, name: string) => rows.find((item) => item.name === name)!;

it("opens New session on the phone instead of marking it desktop-only", () => {
  const rows = composerBuiltins(copy, "claude");
  expect(row(rows, "new")).toMatchObject({ action: "new-session", unavailable: undefined });
});

it("routes resume and folders to the session's project destinations", () => {
  const rows = composerBuiltins(copy, "claude", ["projects.organization.desktop.v1"], { project: true });
  expect(row(rows, "resume")).toMatchObject({ action: "resume", unavailable: undefined });
  expect(row(rows, "add-to-folder")).toMatchObject({ action: "move-to-folder", unavailable: undefined });
});

it("keeps a command desktop-only where the phone has no destination for it", () => {
  const noProject = composerBuiltins(copy, "codex", ["projects.organization.desktop.v1"]);
  expect(row(noProject, "resume")).toMatchObject({ unavailable: "Available on desktop" });
  expect(row(noProject, "resume").action).toBeUndefined();
  expect(row(noProject, "add-to-folder").unavailable).toBe("Available on desktop");
  const olderComputer = composerBuiltins(copy, "claude", [], { project: true });
  expect(row(olderComputer, "add-to-folder")).toMatchObject({ unavailable: "Available on desktop" });
  expect(row(olderComputer, "add-to-folder").action).toBeUndefined();
  expect(row(olderComputer, "clear").unavailable).toBe("Available on desktop");
});

it("recognises only the navigation actions", () => {
  expect(isComposerNavigationAction("new-session")).toBe(true);
  expect(isComposerNavigationAction("move-to-folder")).toBe(true);
  expect(isComposerNavigationAction("side-question")).toBe(false);
  expect(isComposerNavigationAction(undefined)).toBe(false);
});
