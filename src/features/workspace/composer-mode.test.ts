import { expect, it } from "vitest";
import {
  activeComposerMode,
  planModeActive,
  setComposerMode,
  stripComposerMode,
  togglePlanMode,
} from "./composer-mode";

it("adds and removes the leading /plan command without touching the draft", () => {
  expect(planModeActive("/plan build it")).toBe(true);
  expect(planModeActive("  /PLAN")).toBe(true);
  expect(planModeActive("/planet")).toBe(false);
  expect(planModeActive("a /plan b")).toBe(false);
  expect(togglePlanMode("fix the bug")).toBe("/plan fix the bug");
  expect(togglePlanMode("")).toBe("/plan ");
  expect(togglePlanMode("/plan fix the bug")).toBe("fix the bug");
  expect(togglePlanMode(togglePlanMode("x"))).toBe("x");
});

it("keeps modes mutually exclusive and clears them again", () => {
  expect(activeComposerMode("/draft later")).toBe("draft");
  expect(activeComposerMode("/drafts")).toBe(null);
  expect(setComposerMode("note", "draft")).toBe("/draft note");
  expect(setComposerMode("/plan note", "draft")).toBe("/draft note");
  expect(setComposerMode("/draft note", "plan")).toBe("/plan note");
  expect(setComposerMode("/draft note", "draft")).toBe("note");
  expect(setComposerMode("/plan note", null)).toBe("note");
  expect(stripComposerMode("/draft ")).toBe("");
  expect(activeComposerMode(stripComposerMode("/plan x"))).toBe(null);
});
