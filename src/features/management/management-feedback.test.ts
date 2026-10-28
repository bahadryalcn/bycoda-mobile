// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AutomationsScreen } from "./automations-screen";
import { StewardsScreen } from "./stewards-screen";
import { SocialScreen } from "./social-screen";
import { TasksScreen } from "./tasks-screen";

const state = vi.hoisted(() => ({
  projectId: "project" as string | null,
  providers: [{}],
  data: [] as unknown,
  mutate: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("expo-router", () => ({ router: { push: state.navigate } }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
// Screen feedback consumes a workspace snapshot; transport/crypto have their own tests.
vi.mock("./social/use-workspace-query", () => ({
  useSocialWorkspace: () => ({
    query: { data: state.data, isSuccess: true, isFetching: false, error: null },
    state: state.data,
    page: undefined,
    collection: "threads",
    missingEnvironment: false,
  }),
}));
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/ui/filter-sheet", () => ({ FilterButton: () => null, FilterSheet: () => null }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({
    id: "machine",
    capabilities: ["stewards"],
    providers: state.providers,
  }),
  useMachines: (selector: (value: unknown) => unknown) =>
    selector({ selectedProjectId: state.projectId }),
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({ data: state.data, isSuccess: true, isFetching: false, error: null }),
  useHostMutation: () => ({ mutate: state.mutate, isPending: false, reset: vi.fn() }),
}));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({ data: [] }) }));
vi.mock("./shared/scope", () => ({ Scope: () => null }));
vi.mock("./shared/use-editor-record", () => ({
  useEditorRecord: (_id: unknown, value: unknown) => value,
}));
vi.mock("./shared/agent", () => ({ initialAgent: () => ({}) }));
vi.mock("./shared/format", () => ({ identifier: () => "new", stamp: () => "date" }));
vi.mock("./automations/automation-editor", () => ({ AutomationEditor: () => null }));
vi.mock("./tasks/task-editor", () => ({ TaskEditor: () => null }));
vi.mock("./tasks/delivery-editor", () => ({ DeliveryEditor: () => null }));
vi.mock("./tasks/task-card", () => ({ TaskCard: () => null }));
vi.mock("./tasks/bulk-actions", () => ({ TaskBulkActions: () => null }));
vi.mock("./automations/automation-card", () => ({
  AutomationCard: ({ item }: { item: { name: string } }) => createElement("span", null, item.name),
}));
vi.mock("./automations/schedule-model", () => ({ scheduleLabel: () => "Daily" }));
vi.mock("./stewards/steward-editor", () => ({
  StewardEditor: ({ initial }: { initial: { id: string } }) =>
    createElement("span", null, `editing:${initial.id}`),
}));
vi.mock("./social/accounts-panel", () => ({ AccountsPanel: () => null }));
vi.mock("./social/threads-panel", () => ({ ThreadsPanel: () => null }));
vi.mock("./social/drafts-panel", () => ({ DraftsPanel: () => null }));
vi.mock("./social/campaigns-panel", () => ({ CampaignsPanel: () => null }));
vi.mock("./social/rules-panel", () => ({ RulesPanel: () => null }));
vi.mock("./social/jobs-panel", () => ({ JobsPanel: () => null }));
vi.mock("@/ui/record-card", () => ({
  RecordCard: ({ title }: { title: string }) => createElement("span", null, title),
}));
vi.mock("@/ui/screen-list", () => ({
  ScreenList: ({
    header,
    actions,
    data,
    renderItem,
  }: {
    header: ReactNode;
    actions?: ReactNode;
    data: unknown[];
    renderItem: (entry: { item: unknown }) => ReactNode;
  }) =>
    createElement(
      "div",
      null,
      actions,
      header,
      data.map((item, index) => createElement("div", { key: index }, renderItem({ item }))),
    ),
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  const Button = ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    onPress?: () => void;
  }) => createElement("button", { disabled, onClick: onPress }, label);
  return {
    Body: Wrapper,
    Screen: Wrapper,
    Sheet: Wrapper,
    Row: Wrapper,
    NavigationGroup: Wrapper,
    Button,
    IconButton: Button,
    ActionMenu: () => null,
    ErrorText: () => null,
    MutationState: () => null,
    Notice: ({
      message,
      retryLabel,
      onRetry,
    }: {
      message: string;
      retryLabel?: string;
      onRetry?: () => void;
    }) =>
      createElement(
        "div",
        null,
        message,
        retryLabel ? createElement("button", { onClick: onRetry }, retryLabel) : null,
      ),
    QueryState: ({ empty, emptyTitle }: { empty?: boolean; emptyTitle?: string }) =>
      empty ? createElement("span", null, emptyTitle) : null,
    SearchField: ({
      value,
      onChangeText,
    }: {
      value: string;
      onChangeText: (value: string) => void;
    }) =>
      createElement("input", {
        value,
        onChange: (event: { target: { value: string } }) => onChangeText(event.target.value),
      }),
    SelectField: () => null,
    Badge: ({ label, tone }: { label: string; tone: string }) =>
      createElement("span", { "data-tone": tone }, label),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  state.projectId = "project";
  state.providers = [{}];
  state.data = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function render(Screen: typeof AutomationsScreen) {
  await act(async () => root.render(createElement(Screen)));
}
async function search(value: string) {
  await act(async () => {
    const input = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(label: string) {
  return [...container.querySelectorAll("button")].find((node) => node.textContent === label)!;
}

it.each([AutomationsScreen, StewardsScreen])(
  "distinguishes filtered empty results and clears only the search",
  async (Screen) => {
    state.data = [
      {
        id: "record",
        projectId: "project",
        name: "Daily",
        prompt: "Inspect",
        focus: "Inspect",
        model: "fixture",
      },
    ];
    await render(Screen);
    await search("no-match");
    expect(container.textContent).toContain("No matching results");
    expect(container.textContent).not.toMatch(/No (automations|project stewards) yet/);
    await act(async () => button("Clear search").click());
    expect(container.querySelector("input")!.value).toBe("");
    expect(state.projectId).toBe("project");
    expect(state.mutate).not.toHaveBeenCalled();
  },
);
it.each([AutomationsScreen, StewardsScreen, TasksScreen])(
  "explains project and provider creation prerequisites without starting setup",
  async (Screen) => {
    state.projectId = null;
    await render(Screen);
    expect(container.textContent).toContain(
      Screen === TasksScreen ? "Select a project to add a task." : "Choose a project to create",
    );
    expect(container.querySelector("button")!.disabled).toBe(true);
    state.projectId = "project";
    state.providers = [];
    await render(Screen);
    expect(container.textContent).toContain(
      "This computer has not reported an available agent. Check providers.",
    );
    expect(container.querySelector("button")!.disabled).toBe(true);
    await act(async () => button("Provider center").click());
    expect(state.navigate).toHaveBeenCalledExactlyOnceWith("/tools/providers");
    expect(state.projectId).toBe("project");
    expect(state.mutate).not.toHaveBeenCalled();
    state.providers = [{}];
    await render(Screen);
    expect(container.textContent).not.toContain(
      "This computer has not reported an available agent.",
    );
  },
);
it("opens the existing steward instead of permitting a duplicate", async () => {
  state.data = [{ id: "existing", projectId: "project", focus: "Inspect", model: "fixture" }];
  await render(StewardsScreen);
  expect(container.textContent).toContain("This project already has a steward.");
  expect(button("New project steward").disabled).toBe(true);
  await act(async () => button("Edit project steward").click());
  expect(container.textContent).toContain("editing:existing");
  expect(state.mutate).not.toHaveBeenCalled();
});
it.each([
  { hostOnline: true, stopped: false, label: "Computer online", stoppedLabel: false },
  { hostOnline: true, stopped: true, label: "Computer online", stoppedLabel: true },
  { hostOnline: false, stopped: false, label: "Computer offline", stoppedLabel: false },
  { hostOnline: false, stopped: true, label: "Computer offline", stoppedLabel: true },
])(
  "keeps social connectivity, stop state and send authorization independent: $hostOnline/$stopped",
  async ({ hostOnline, stopped, label, stoppedLabel }) => {
    state.data = {
      hostOnline,
      stopped,
      sendingEnabled: true,
      threads: [],
      drafts: [],
      accounts: [],
      campaigns: [],
      rules: [],
      jobs: [],
    };
    await render(SocialScreen);
    expect(container.textContent).toContain(label);
    expect(container.textContent?.includes("Sending stopped")).toBe(stoppedLabel);
    expect(container.textContent).toContain("Sending authorized");
    expect(container.textContent).not.toContain("Running");
    expect(state.mutate).not.toHaveBeenCalled();
  },
);
