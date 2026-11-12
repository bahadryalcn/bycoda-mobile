import { describe, expect, it, vi } from "vitest";
import { goalsPollInterval } from "./goals-screen";

vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});

// The screen pulls native UI and host modules; only the pure poll helper is under test.
vi.mock("react-native", () => ({}));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({ data: [] }) }));
vi.mock("panelui-native", () => ({}));
vi.mock("@/ui/primitives", () => ({}));
vi.mock("@/ui/filter-sheet", () => ({}));
vi.mock("./shared/scope", () => ({ Scope: () => null }));
vi.mock("./goals/goal-card", () => ({ GoalCard: () => null }));
vi.mock("./goals/goal-editor", () => ({ GoalEditor: () => null }));
vi.mock("./goals/replan-editor", () => ({ ReplanEditor: () => null }));
vi.mock("./goals/settings-editor", () => ({ GoalSettingsEditor: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => () => "" }));
vi.mock("@/state/queries", () => ({ useHostMutation: () => ({}), useHostQuery: () => ({}) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => null, useMachines: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({}) }));
vi.mock("@/ui/screen-list", () => ({ ScreenList: () => null }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));

describe("goals poll interval", () => {
  it("polls at 5 s while a goal is planning or running", () => {
    expect(goalsPollInterval([{ status: "done" }, { status: "running" }])).toBe(5000);
    expect(goalsPollInterval([{ status: "planning" }])).toBe(5000);
  });

  it("slows to 15 s when no goal is in progress", () => {
    expect(goalsPollInterval([{ status: "done" }, { status: "awaiting-approval" }])).toBe(15_000);
    expect(goalsPollInterval([])).toBe(15_000);
    expect(goalsPollInterval(undefined)).toBe(15_000);
  });
});
