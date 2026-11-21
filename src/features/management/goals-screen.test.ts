// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { getQueryPresentation, type QueryLike } from "@/ui/query-presentation";
const fixture = vi.hoisted(() => ({ push: vi.fn(), mutate: vi.fn(), projectId: null as string | null, providers: [] as unknown[], visible: true, catalog: undefined as unknown, goals: [] as unknown[], tasks: undefined as unknown, taskRefetch: vi.fn(() => Promise.resolve()), queries: [] as { key: unknown[]; method: string; options: { enabled?: boolean; interval?: () => number | false } }[], cards: [] as { goal: { id: string }; progress?: unknown; tasks?: unknown }[] }));
vi.mock("expo-router", () => ({ router: { navigate: fixture.push } }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "host-a", providers: fixture.providers }), useMachines: (selector: (state: unknown) => unknown) => selector({ selectedProjectId: fixture.projectId }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: (key: unknown[], method: string, _params: unknown, options: never) => {
  fixture.queries.push({ key, method, options });
  return { data: method === "models.list" ? fixture.catalog : method === "goals.list" ? fixture.goals : method === "tasks.list" ? fixture.tasks : [], isSuccess: true, refetch: method === "tasks.list" ? fixture.taskRefetch : vi.fn() };
}, useHostMutation: () => ({ isPending: false, mutate: fixture.mutate, reset: vi.fn() }) }));
vi.mock("./shared/use-editor-record", () => ({ useEditorRecord: () => undefined }));
vi.mock("./shared/format", () => ({ identifier: () => "fixture-automation" }));
vi.mock("./shared/scope", () => ({ Scope: () => null }));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({ data: [], directoryReady: true, isProjectVisible: () => fixture.visible }) }));
vi.mock("./goals/goal-editor", () => ({ GoalEditor: () => null }));
vi.mock("./goals/replan-editor", () => ({ ReplanEditor: ({ available }: { available: boolean }) => createElement(
  "div", null, createElement("textarea", { "aria-label": "Plan feedback" }), createElement("button", { disabled: !available }, "Replan"),
) }));
vi.mock("./goals/settings-editor", () => ({ GoalSettingsEditor: () => null }));
vi.mock("./goals/goal-card", () => ({ GoalCard: (props: { goal: { id: string }; onReplan(id: string): void }) => {
  fixture.cards.push(props);
  return createElement("button", { onClick: () => props.onReplan(props.goal.id) }, "Revise plan");
} }));
vi.mock("@/ui/filter-sheet", () => ({ AppliedFilters: () => null, FilterButton: () => null, FilterSheet: () => null }));
vi.mock("@/ui/screen-list", () => ({ ScreenList: ({ header, actions, data, renderItem }: { header: React.ReactNode; actions: React.ReactNode; data: { id: string }[]; renderItem: (info: { item: { id: string } }) => React.ReactNode }) => createElement("main", null, createElement("nav", null, actions), header, ...data.map(item => createElement("section", { key: item.id }, renderItem({ item })))) }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Heading: Group, Button: () => null, Sheet: Group, MutationState: () => null, SelectField: () => null, SearchField: () => null, SearchToolbar: () => null,
    QueryState: ({ query, empty, emptyAction }: { query: QueryLike; empty?: boolean; emptyAction?: { label: string; onPress(): void } }) =>
      getQueryPresentation(query, empty) === "empty" && emptyAction ? createElement("button", { onClick: emptyAction.onPress }, emptyAction.label) : null,
    IconButton: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
    Notice: ({ message, retryLabel, onRetry }: { message: string; retryLabel?: string; onRetry?(): void }) => createElement("aside", null, message, retryLabel ? createElement("button", { onClick: onRetry }, retryLabel) : null) };
});
import { GoalsScreen } from "./goals-screen";
beforeEach(() => { fixture.push.mockReset(); fixture.mutate.mockReset(); fixture.projectId = null; fixture.providers = []; fixture.visible = true; fixture.catalog = undefined; fixture.goals = []; fixture.tasks = undefined; fixture.taskRefetch.mockClear(); fixture.queries = []; fixture.cards = []; });
const epic = (id: string, status: string, taskIds: string[], updatedAt = 1) => ({ id, title: id, prompt: "", status, taskIds, projectIds: [], updatedAt });
const taskQuery = () => fixture.queries.filter(query => query.method === "tasks.list").at(-1)!;
async function renderScreen(root: ReturnType<typeof createRoot>) { await act(async () => root.render(createElement(GoalsScreen))); }
it("does not load the task list for an Epics screen without task-owning epics", async () => {
  fixture.goals = [epic("planning", "planning", [])];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const root = createRoot(document.createElement("div"));
  try {
    await renderScreen(root);
    expect(taskQuery().options.enabled).toBe(false);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
it("retains feedback and blocks replanning when the open epic disappears during a refresh", async () => {
  const goal = epic("review", "awaiting-approval", []);
  fixture.goals = [goal];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  const replan = () => [...container.querySelectorAll("button")].find(button => button.textContent === "Replan");
  try {
    await renderScreen(root);
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Revise plan")!.click());
    const draft = container.querySelector("textarea");
    expect(draft).not.toBeNull();
    draft!.value = "Verify the tablet layout first";

    fixture.goals = [];
    await renderScreen(root);
    expect(container.querySelector("textarea")).toBe(draft);
    expect(draft!.value).toBe("Verify the tablet layout first");
    expect(container.textContent).toContain("The epic is no longer available.");
    expect(replan()?.disabled).toBe(true);

    fixture.goals = [goal];
    await renderScreen(root);
    expect(container.querySelector("textarea")).toBe(draft);
    expect(replan()?.disabled).toBe(false);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
it("polls the shared task list only while an epic is open and indexes it once for every card", async () => {
  fixture.goals = [epic("a", "running", ["t2", "t1"]), epic("b", "done", ["t3"])];
  fixture.tasks = [{ id: "t1", title: "One", status: "done" }, { id: "t2", title: "Two", status: "running" }, { id: "t3", title: "Three", status: "done" }];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const root = createRoot(document.createElement("div"));
  try {
    await renderScreen(root);
    expect(taskQuery().key).toEqual(["tasks", null]);
    expect(taskQuery().options.enabled).toBe(true);
    expect(taskQuery().options.interval?.()).toBe(15_000);
    expect(fixture.cards.find(card => card.goal.id === "a")).toMatchObject({ progress: { done: 1, total: 2 }, tasks: [{ id: "t2" }, { id: "t1" }] });
    expect(fixture.cards.find(card => card.goal.id === "b")).toMatchObject({ progress: { done: 1, total: 1 } });
    fixture.goals = [epic("a", "done", ["t2", "t1"], 2), epic("b", "done", ["t3"])];
    fixture.queries = [];
    await renderScreen(root);
    expect(taskQuery().options.interval?.()).toBe(false);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
it("shows epics without progress until the task list loads", async () => {
  fixture.goals = [epic("a", "running", ["t1"])];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const root = createRoot(document.createElement("div"));
  try {
    await renderScreen(root);
    expect(fixture.cards.at(-1)).toMatchObject({ goal: { id: "a" }, progress: undefined, tasks: undefined });
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
it("re-reads tasks once when an epic record changes, not on every render", async () => {
  fixture.goals = [epic("a", "running", ["t1"], 1)];
  fixture.tasks = [{ id: "t1", title: "One", status: "running" }];
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const root = createRoot(document.createElement("div"));
  try {
    await renderScreen(root);
    await renderScreen(root);
    expect(fixture.taskRefetch).not.toHaveBeenCalled();
    fixture.goals = [epic("a", "done", ["t1"], 2)];
    await renderScreen(root);
    expect(fixture.taskRefetch).toHaveBeenCalledOnce();
    await renderScreen(root);
    expect(fixture.taskRefetch).toHaveBeenCalledOnce();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
it.each([null, "project"])("explains unavailable providers without allowing epic creation in scope %s", async projectId => {
  fixture.projectId = projectId;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(GoalsScreen)));
    expect(container.textContent).toContain("This computer has not reported an available agent. Check providers.");

    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.find(node => node.textContent === "New epic")).toBeUndefined();
    await act(async () => buttons.find(node => node.textContent === "Provider center")!.click());
    expect(fixture.push).toHaveBeenCalledExactlyOnceWith("/tools/providers"); expect(fixture.mutate).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
it("does not enable creation for an unavailable selected project", async () => {
  fixture.projectId = "removed-project"; fixture.providers = [{}]; fixture.visible = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(GoalsScreen)));
    expect([...container.querySelectorAll("button")].find(node => node.textContent === "New epic")).toBeUndefined();
    expect(fixture.mutate).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});


it("allows an all-projects epic when live discovery adds a provider to an empty descriptor", async () => {
  fixture.catalog = { models: { codex: [{ id: "model" }] }, errors: {} };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(GoalsScreen)));
    const buttons = () => [...container.querySelectorAll("button")].filter(node => node.textContent === "New epic");
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0]!.closest("nav")).toBeNull();
    fixture.goals = [epic("existing", "planning", [])];
    await renderScreen(root);
    expect(buttons()).toHaveLength(1);
    const button = buttons()[0]!;
    expect(button.closest("nav")).not.toBeNull();
    expect(button.disabled).toBe(false);
    await act(async () => button.click());
    expect(fixture.mutate).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
