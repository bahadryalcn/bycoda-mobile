// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TasksScreen } from "./tasks-screen";

type Call = { key: readonly unknown[]; method: string; params: Record<string, unknown>; options: { enabled?: boolean; interval?: unknown } };
const state = vi.hoisted(() => ({
  capabilities: [] as string[],
  projectId: "project" as string | null,
  all: [] as unknown[],
  calls: [] as Call[],
  cards: [] as Array<{ id: string; tasks: unknown[]; lifecycleReady: boolean }>,
  lists: [] as unknown[][],
  refetch: vi.fn(),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({}) }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/filter-sheet", () => ({ AppliedFilters: () => null, FilterButton: () => null, FilterSheet: () => null }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "machine", capabilities: state.capabilities }),
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: (key: readonly unknown[], method: string, params: Record<string, unknown>, options: Call["options"] = {}) => {
    state.calls.push({ key, method, params, options });
    const projectId = params.projectId;
    const data = (state.all as Array<{ projectId: string }>).filter((task) => !projectId || task.projectId === projectId);
    return { data, isSuccess: true, isFetching: false, error: null, refetch: state.refetch };
  },
  useHostMutation: () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() }),
}));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({ data: [] }) }));
vi.mock("./shared/local-project-scope", () => ({ useLocalProjectScope: () => ({ projectId: state.projectId, setProjectId: vi.fn() }) }));
vi.mock("./shared/scope", () => ({ Scope: () => null }));
vi.mock("./shared/use-editor-record", () => ({ useEditorRecord: (_id: unknown, value: unknown) => value }));
vi.mock("./shared/agent", () => ({ initialAgent: () => ({}), useAgentProviders: () => ({ providers: [{}], query: { isSuccess: true, isFetching: false, error: null } }) }));
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
  TaskBulkActions: ({ tasks, onComplete }: { tasks: unknown[]; onComplete: () => Promise<void> }) => {
    state.lists.push(tasks);
    state.lists.push([onComplete]);
    return null;
  },
}));
vi.mock("@/ui/screen-list", () => ({
  ScreenList: ({ header, data, renderItem }: { header: unknown; data: unknown[]; renderItem: (entry: { item: unknown }) => unknown }) =>
    createElement("div", null, header as never, data.map((item, index) => createElement("div", { key: index }, renderItem({ item }) as never))),
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: { children?: unknown }) => createElement("div", null, children as never);
  const None = () => null;
  return {
    Body: Wrapper, Button: None, Card: Wrapper, IconButton: None, SearchField: None, SearchToolbar: Wrapper,
    SelectField: None, Sheet: Wrapper, MutationState: None, Notice: None, QueryState: None, Row: Wrapper, Screen: Wrapper,
  };
});

const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const task = (id: string, projectId: string) => ({ id, projectId, title: id, prompt: id, status: "todo" });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  state.capabilities = [];
  state.projectId = "project";
  state.all = [task("a", "project"), task("b", "other"), task("c", "project")];
  state.calls = [];
  state.cards = [];
  state.lists = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const render = () => act(async () => root.render(createElement(TasksScreen)));
const polled = () => state.calls.filter((call) => call.method === "tasks.list" && call.options.interval !== undefined && call.options.enabled !== false);

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
