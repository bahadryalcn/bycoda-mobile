// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ push: vi.fn(), mutate: vi.fn(), projectId: null as string | null, providers: [] as unknown[], visible: true, catalog: undefined as unknown }));
vi.mock("expo-router", () => ({ router: { navigate: fixture.push } }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "host-a", providers: fixture.providers }), useMachines: (selector: (state: unknown) => unknown) => selector({ selectedProjectId: fixture.projectId }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: (_key: unknown, method: string) => ({ data: method === "models.list" ? fixture.catalog : [], isSuccess: true }), useHostMutation: () => ({ isPending: false, mutate: fixture.mutate, reset: vi.fn() }) }));
vi.mock("./shared/use-editor-record", () => ({ useEditorRecord: () => undefined }));
vi.mock("./shared/format", () => ({ identifier: () => "fixture-automation" }));
vi.mock("./shared/scope", () => ({ Scope: () => null }));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({ data: [], directoryReady: true, isProjectVisible: () => fixture.visible }) }));
vi.mock("./goals/goal-editor", () => ({ GoalEditor: () => null }));
vi.mock("./goals/replan-editor", () => ({ ReplanEditor: () => null }));
vi.mock("./goals/settings-editor", () => ({ GoalSettingsEditor: () => null }));
vi.mock("./goals/goal-card", () => ({ GoalCard: () => null }));
vi.mock("@/ui/filter-sheet", () => ({ AppliedFilters: () => null, FilterButton: () => null, FilterSheet: () => null }));
vi.mock("@/ui/screen-list", () => ({ ScreenList: ({ header, actions }: { header: React.ReactNode; actions: React.ReactNode }) => createElement("main", null, actions, header) }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Heading: Group, Button: () => null, Sheet: Group, MutationState: () => null, QueryState: () => null, SelectField: () => null, SearchField: () => null, SearchToolbar: () => null,
    IconButton: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
    Notice: ({ message, retryLabel, onRetry }: { message: string; retryLabel?: string; onRetry?(): void }) => createElement("aside", null, message, retryLabel ? createElement("button", { onClick: onRetry }, retryLabel) : null) };
});
import { GoalsScreen } from "./goals-screen";
beforeEach(() => { fixture.push.mockReset(); fixture.mutate.mockReset(); fixture.projectId = null; fixture.providers = []; fixture.visible = true; fixture.catalog = undefined; });
it.each([null, "project"])("explains unavailable providers without allowing epic creation in scope %s", async projectId => {
  fixture.projectId = projectId;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(GoalsScreen)));
    expect(container.textContent).toContain("This computer has not reported an available agent. Check providers.");

    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.find(node => node.textContent === "New epic")?.disabled).toBe(true);
    await act(async () => buttons.find(node => node.textContent === "Provider center")!.click());
    expect(fixture.push).toHaveBeenCalledExactlyOnceWith("/tools/providers"); expect(fixture.mutate).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
it("does not enable creation for an unavailable selected project", async () => {
  fixture.projectId = "removed-project"; fixture.providers = [{}]; fixture.visible = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(GoalsScreen)));
    expect([...container.querySelectorAll("button")].find(node => node.textContent === "New epic")?.disabled).toBe(true);
    expect(fixture.mutate).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});


it("allows an all-projects epic when live discovery adds a provider to an empty descriptor", async () => {
  fixture.catalog = { models: { codex: [{ id: "model" }] }, errors: {} };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(GoalsScreen)));
    const button = [...container.querySelectorAll("button")].find(node => node.textContent === "New epic")!;
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(fixture.mutate).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
