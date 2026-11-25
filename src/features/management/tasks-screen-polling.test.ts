// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TasksScreen } from "./tasks-screen";
import { getQueryPresentation } from "@/ui/query-presentation";

type Call = { key: readonly unknown[]; method: string; params: Record<string, unknown>; options: { enabled?: boolean; interval?: unknown } };
const state = vi.hoisted(() => ({
  capabilities: [] as string[],
  projectId: "project" as string | null,
  all: [] as unknown[],
  calls: [] as Call[],
  cards: [] as Array<{ id: string; tasks: unknown[]; lifecycleReady: boolean }>,
  lists: [] as unknown[][],
  availability: "ready" as "ready" | "loading" | "error",
  hasProvider: true,
  projectVerified: true,
  refetch: vi.fn(),
  linked: {} as { taskId?: string; machineId?: string; projectId?: string },
  replace: vi.fn(),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => state.linked, router: { replace: state.replace } }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("react-native", () => ({ View: "div", ScrollView: "div", useWindowDimensions: () => ({ fontScale: 1 }) }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/filter-sheet", () => ({
  AppliedFilters: () => null,
  FilterButton: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "machine", capabilities: state.capabilities }),
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: (key: readonly unknown[], method: string, params: Record<string, unknown>, options: Call["options"] = {}) => {
    state.calls.push({ key, method, params, options });
    const projectId = params.projectId;
    const data = (state.all as Array<{ projectId: string }>).filter((task) => !projectId || task.projectId === projectId);
    return {
      data: state.availability === "ready" ? data : undefined,
      isSuccess: state.availability === "ready",
      isLoading: state.availability === "loading",
      isFetching: state.availability === "loading",
      error: state.availability === "error" ? new Error("Unavailable") : null,
      refetch: state.refetch,
    };
  },
  useHostMutation: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }),
}));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({
  data: [], directoryReady: true, isProjectVisible: () => state.projectVerified,
}) }));
vi.mock("./shared/local-project-scope", () => ({ useLocalProjectScope: () => ({ projectId: state.projectId, setProjectId: vi.fn() }) }));
vi.mock("./shared/scope", () => ({ Scope: () => createElement("span", { "data-project-picker": true }) }));
vi.mock("./shared/use-editor-record", () => ({ useEditorRecord: (_id: unknown, value: unknown) => value }));
vi.mock("./shared/agent", () => ({ initialAgent: () => ({}), useAgentProviders: () => ({ providers: state.hasProvider ? [{}] : [], query: { isSuccess: true, isFetching: false, error: null } }) }));
vi.mock("./shared/format", () => ({ identifier: () => "new" }));
vi.mock("./shared/agent-provider-prerequisite", () => ({ AgentProviderPrerequisite: () => null }));
vi.mock("./tasks/task-editor", () => ({ TaskEditor: () => null }));
vi.mock("./tasks/delivery-editor", () => ({ DeliveryEditor: () => null }));
vi.mock("./tasks/task-feedback", () => ({ TaskDeclineFeedback: () => null }));
vi.mock("./tasks/task-card", () => ({
  TaskCard: (props: { task: { id: string }; tasks: unknown[]; lifecycleReady: boolean }) => {
    state.cards.push({ id: props.task.id, tasks: props.tasks, lifecycleReady: props.lifecycleReady });
    return null;
  },
}));
vi.mock("./tasks/bulk-actions", () => ({
  useTaskBulkActions: ({ tasks, onComplete, context }: { tasks: unknown[]; onComplete: () => Promise<void>; context?: ReactNode }) => {
    // The latest render's inputs: the visible tasks and the refresh callback.
    state.lists = [tasks, [onComplete]];
    return { entry: context ?? null, feedback: null, bar: null, selection: { active: false, isSelected: () => false, toggle: () => {} } };
  },
}));
vi.mock("@/ui/screen-list", () => ({
  ScreenList: ({ header, actions, context, data, renderItem, ListEmptyComponent }: { header: unknown; actions: unknown; context: ReactNode; ListEmptyComponent?: ReactNode; data: unknown[]; renderItem: (entry: { item: unknown }) => unknown }) =>
    createElement("div", null, createElement("nav", null, actions as never), context, header as never, data.length ? null : ListEmptyComponent, data.map((item, index) => createElement("div", { key: index }, renderItem({ item }) as never))),
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: { children?: unknown }) => createElement("div", null, children as never);
  const None = () => null;
  const Action = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, label);
  return {
    ChoiceChip: Action, Body: Wrapper, Button: Action, Card: Wrapper, IconButton: Action,
    SearchField: ({ onChangeText }: { onChangeText: (text: string) => void }) =>
      createElement("input", { onInput: (event: { currentTarget: HTMLInputElement }) => onChangeText(event.currentTarget.value) }),
    SearchToolbar: ({ search, actions }: { search: ReactNode; actions: ReactNode }) =>
      createElement("div", null, search, actions),
    SelectField: ({ value, options, onChange }: {
      value: string;
      options: { value: string; label: string }[];
      onChange: (value: string) => void;
    }) => createElement(
      "select",
      { value, onChange: (event: { currentTarget: HTMLSelectElement }) => onChange(event.currentTarget.value) },
      options.map((option) => createElement("option", { key: option.value, value: option.value }, option.label)),
    ),
    MutationState: None, Notice: None, Row: Wrapper, Screen: Wrapper,
    Sheet: ({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: never }) =>
      visible ? createElement("section", { "aria-label": title }, createElement("button", { onClick: onClose }, "Close"), children) : null,
    QueryState: ({ query, empty, emptyAction }: {
      query: Parameters<typeof getQueryPresentation>[0];
      empty?: boolean;
      emptyAction?: Parameters<typeof Action>[0];
    }) => getQueryPresentation(query, empty) === "empty" && emptyAction ? createElement(Action, emptyAction) : null,
  };
});

const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const task = (id: string, projectId: string) => ({ id, projectId, title: id, prompt: id, status: "todo" });
it("shows a linked task without inactive filters and opens the regular listing on request", async () => {
  state.linked = { taskId: "linked", machineId: "machine", projectId: "linked-project" };
  state.all = [task("linked", "linked-project"), task("other", "project")];
  try {
    await act(async () => root.render(createElement(TasksScreen)));
    expect(state.cards.at(-1)?.id).toBe("linked");
    expect(container.querySelector("[data-project-picker]")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.textContent).not.toContain("Filters");
    const showAll = [...container.querySelectorAll("button")].find(row => row.textContent === "Show all")!;
    await act(async () => showAll.click());
    expect(state.replace).toHaveBeenCalledExactlyOnceWith({ pathname: "/manage/[section]", params: { section: "tasks" } });
    state.linked = {};
    await act(async () => root.render(createElement(TasksScreen)));
    expect(state.cards.at(-1)?.id).toBe("other");
    expect(container.querySelector("[data-project-picker]")).not.toBeNull();
    expect(container.querySelector("input")).not.toBeNull();
  } finally {
    state.linked = {};
    state.replace.mockClear();
  }
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  state.capabilities = [];
  state.projectId = "project";
  state.all = [task("a", "project"), task("b", "other"), task("c", "project")];
  state.calls = [];
  state.cards = [];
  state.lists = [];
  state.availability = "ready";
  state.hasProvider = true;
  state.projectVerified = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const render = () => act(async () => root.render(createElement(TasksScreen)));
const polled = () => state.calls.filter((call) => call.method === "tasks.list" && call.options.interval !== undefined && call.options.enabled !== false);
const createButtons = () => [...container.querySelectorAll("button")].filter((button) => button.textContent === "New task");
const button = (label: string) => [...container.querySelectorAll("button")].find((control) => control.textContent === label);

it("disables New task if the selected project can no longer be verified", async () => {
  await render();
  expect(button("New task")?.disabled).toBe(false);
  state.projectVerified = false;
  await act(async () => button("New task")!.click());
  expect(container.querySelector('section[aria-label="New task"]')).toBeNull();
  await render();
  expect(button("New task")?.disabled).toBe(true);
  state.projectVerified = true;
  await render();
  expect(button("New task")?.disabled).toBe(false);
});

async function applyStatusFilter(status: string) {
  await act(async () => button("Status")!.click());
  const label = { blocked: "Blocked", todo: "To do", all: "All" }[status];
  await act(async () => button(label!)!.click());
  expect(button("Apply")).toBeUndefined();
}

it("shows a single empty-state create action for an empty selected project and restores it after closing the new task sheet", async () => {
  state.capabilities = ["tasks.workspaces"];
  state.all = [task("b", "other")];
  await render();
  expect(createButtons()).toHaveLength(1);
  expect(createButtons()[0]!.closest("nav")).toBeNull();
  await act(async () => createButtons()[0]!.click());
  expect(container.querySelector('section[aria-label="New task"]')).not.toBeNull();
  expect(createButtons()).toHaveLength(0);
  await act(async () => container.querySelector("section button")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(createButtons()).toHaveLength(1);
});

it("keeps the header create action alongside filter recovery for a populated scope", async () => {
  await render();
  expect(createButtons()).toHaveLength(1);
  expect(createButtons()[0]!.closest("nav")).not.toBeNull();
  const input = container.querySelector("input")!;
  await act(async () => {
    input.value = "missing";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(createButtons()).toHaveLength(1);
  expect(createButtons()[0]!.closest("nav")).not.toBeNull();
  expect(container.textContent).toContain("Clear search");
});

it("offers filter recovery instead of centered creation when an empty project is filtered to Blocked", async () => {
  state.capabilities = ["tasks.workspaces"];
  state.all = [task("other-task", "other")];
  await render();
  await applyStatusFilter("blocked");
  const clear = button("Clear filters");
  expect(clear).toBeDefined();
  expect(clear!.closest("nav")).toBeNull();
  expect(createButtons().every((control) => control.closest("nav"))).toBe(true);
  await act(async () => clear!.click());
  expect(button("Clear filters")).toBeUndefined();
  expect(createButtons()).toHaveLength(1);
  expect(createButtons()[0]!.closest("nav")).toBeNull();
});

it("clears a search on an empty project before offering centered creation", async () => {
  state.all = [];
  await render();
  const input = container.querySelector("input")!;
  await act(async () => {
    input.value = "migration";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(createButtons().every((control) => control.closest("nav"))).toBe(true);
  await act(async () => button("Clear search")!.click());
  expect(button("Clear search")).toBeUndefined();
  expect(createButtons()).toHaveLength(1);
  expect(createButtons()[0]!.closest("nav")).toBeNull();
});

it.each(["todo", "all"])("retains one centered create action when the %s filter reveals new tasks", async (status) => {
  state.all = [];
  await render();
  await applyStatusFilter(status);
  expect(createButtons()).toHaveLength(1);
  expect(createButtons()[0]!.closest("nav")).toBeNull();
  expect(button("Clear filters")).toBeUndefined();
});

it.each(["loading", "error"] as const)("hides create actions until the scoped list is available (%s)", async (availability) => {
  state.availability = availability;
  await render();
  expect(createButtons()).toHaveLength(0);
});

it("keeps the empty-scope create action unavailable without a provider", async () => {
  state.hasProvider = false;
  state.all = [];
  await render();
  expect(createButtons()).toHaveLength(0);
});

it("polls one global list for a selected project on a lifecycle host and filters it client side", async () => {
  state.capabilities = ["tasks.workspaces"];
  await render();
  expect(polled()).toHaveLength(1);
  expect(polled()[0]).toMatchObject({ key: ["tasks", null], params: {} });
  expect(state.cards.map((card) => card.id)).toEqual(["a", "c"]);
  expect(state.cards[0]).toMatchObject({ lifecycleReady: true });
  expect(state.cards[0]!.tasks).toHaveLength(3);
  expect(state.lists[0]).toHaveLength(2);
  await act(async () => { await (state.lists[1]![0] as () => Promise<void>)(); });
  expect(state.refetch).toHaveBeenCalledTimes(1);
});

it("polls only the scoped list when the host has no lifecycle support", async () => {
  await render();
  expect(polled()).toHaveLength(1);
  expect(polled()[0]).toMatchObject({ key: ["tasks", "project"], params: { projectId: "project" } });
  expect(state.cards.map((card) => card.id)).toEqual(["a", "c"]);
  expect(state.cards[0]).toMatchObject({ lifecycleReady: false, tasks: [] });
});

it("polls the global list once with no project selected", async () => {
  state.projectId = null;
  state.capabilities = ["tasks.workspaces"];
  await render();
  expect(polled()).toHaveLength(1);
  expect(polled()[0]).toMatchObject({ key: ["tasks", null], params: {} });
  expect(state.cards.map((card) => card.id)).toEqual(["a", "b", "c"]);
  expect(state.cards[0]).toMatchObject({ lifecycleReady: true });
});
vi.mock("../workspace/git-delivery", () => ({ GitDeliverySheet: () => null }));
