// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AutomationsScreen } from "./automations-screen";
import { StewardsScreen } from "./stewards-screen";
import { SocialScreen } from "./social-screen";
import { TasksScreen } from "./tasks-screen";
import { CrewsScreen } from "./crews-screen";

const state = vi.hoisted(() => ({
  projectId: "project" as string | null,
  providers: [{}],
  data: [] as unknown,
  mutate: vi.fn(),
  navigate: vi.fn(),
  mutations: {} as Record<
    string,
    { variables?: Record<string, unknown>; error?: Error }
  >,
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("expo-router", () => ({ router: { push: state.navigate } }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
// Screen feedback consumes a workspace snapshot; transport/crypto have their own tests.
vi.mock("./social/use-workspace-query", () => ({
  useSocialWorkspace: () => ({
    query: {
      data: state.data,
      isSuccess: true,
      isFetching: false,
      error: null,
    },
    state: state.data,
    page: undefined,
    collection: "threads",
    missingEnvironment: false,
  }),
}));
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pencil", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/play", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pause", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/message-square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string) => en,
}));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("./crews/member-avatars", () => ({ MemberAvatars: () => null }));
vi.mock("./crews/member-lines", () => ({ MemberLines: () => null }));
vi.mock("./crews/active-crews", () => ({ ActiveCrews: () => null }));
vi.mock("lucide-react-native/icons/copy", () => ({ default: () => null }));
vi.mock("@/ui/filter-sheet", () => ({ AppliedFilters: () => null,
  FilterButton: () => null,
  FilterSheet: () => null,
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({
    id: "machine",
    capabilities: ["stewards", "crews.v1", "crews.delete.v1"],
    providers: state.providers,
  }),
  useMachines: (selector: (value: unknown) => unknown) =>
    selector({ selectedProjectId: state.projectId }),
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({
    data: state.data,
    isSuccess: true,
    isFetching: false,
    error: null,
  }),
  useHostMutation: (method: string) => ({
    mutate: state.mutate,
    isPending: false,
    reset: vi.fn(),
    ...state.mutations[method],
  }),
}));
vi.mock("../workspace/use-project-directory", () => ({
  useProjectList: () => ({ data: [] }),
}));
vi.mock("./shared/scope", () => ({ Scope: () => null }));
vi.mock("./shared/use-editor-record", () => ({
  useEditorRecord: (_id: unknown, value: unknown) => value,
}));
vi.mock("./shared/agent", () => ({ initialAgent: () => ({}) }));
vi.mock("./shared/format", () => ({
  identifier: () => "new",
  stamp: () => "date",
}));
vi.mock("./automations/automation-editor", () => ({
  AutomationEditor: () => null,
}));
vi.mock("./tasks/task-editor", () => ({ TaskEditor: () => null }));
vi.mock("./tasks/delivery-editor", () => ({ DeliveryEditor: () => null }));
vi.mock("./tasks/task-card", () => ({ TaskCard: () => null }));
vi.mock("./tasks/bulk-actions", () => ({ TaskBulkActions: () => null }));
vi.mock("./crews/crew-editor", () => ({ CrewEditor: () => null }));
vi.mock("./crews/profile-editor", () => ({ ProfileEditor: () => null }));
vi.mock("./crews/start-editor", () => ({ StartCrewEditor: () => null }));
vi.mock("./crews/run-card", () => ({ CrewRunCard: () => null }));
vi.mock("./automations/automation-card", () => ({
  AutomationCard: ({ item }: { item: { name: string } }) =>
    createElement("span", null, item.name),
}));
vi.mock("./automations/schedule-model", () => ({
  scheduleLabel: () => "Daily",
  scheduleSentence: () => "Every day",
}));
vi.mock("./stewards/steward-editor", () => ({
  StewardEditor: ({ initial }: { initial: { id: string } }) =>
    createElement("span", null, `editing:${initial.id}`),
}));
vi.mock("./social/accounts-panel", () => ({ AccountsPanel: () => null }));
vi.mock("./social/threads-panel", () => ({ ThreadsPanel: () => null }));
vi.mock("./social/thread-editor", () => ({ ThreadEditor: () => null }));
vi.mock("./social/draft-editor", () => ({ DraftEditor: () => null }));
vi.mock("./social/campaign-editor", () => ({ CampaignEditor: () => null }));
vi.mock("./social/rule-editor", () => ({ RuleEditor: () => null }));
vi.mock("./social/drafts-panel", () => ({ DraftsPanel: () => null }));
vi.mock("./social/campaigns-panel", () => ({ CampaignsPanel: () => null }));
vi.mock("./social/rules-panel", () => ({ RulesPanel: () => null }));
vi.mock("./social/jobs-panel", () => ({ JobsPanel: () => null }));
vi.mock("@/ui/record-card", () => ({
  RecordCard: ({ title, children }: { title: string; children?: ReactNode }) =>
    createElement("section", { "data-record": title }, title, children),
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
      data.map((item, index) =>
        createElement("div", { key: index }, renderItem({ item })),
      ),
    ),
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children);
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
    Screen: ({context,children}:any) => createElement(Wrapper,null,context,children),
    ContextControls: ({scope,view}:any) => createElement(Wrapper,null,scope,view),
    Sheet: Wrapper,
    Row: Wrapper,
    NavigationGroup: Wrapper,
    Button,
    IconButton: Button,
    ActionMenu: () => null,
    ErrorText: () => null,
    ErrorNotice: () => null,
    MutationState: ({ mutation }: { mutation: { error?: Error } }) =>
      mutation.error
        ? createElement("span", null, mutation.error.message)
        : null,
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
        retryLabel
          ? createElement("button", { onClick: onRetry }, retryLabel)
          : null,
      ),
    QueryState: ({
      empty,
      emptyTitle,
      emptyAction,
    }: {
      empty?: boolean;
      emptyTitle?: string;
      emptyAction?: { label: string; onPress: () => void };
    }) => (empty ? createElement("span", null, emptyTitle,
      emptyAction ? createElement(Button, emptyAction) : null) : null),
    SearchToolbar: ({ search, actions }: any) => createElement("div", null, search, actions),
    SearchField: ({
      value,
      onChangeText,
    }: {
      value: string;
      onChangeText: (value: string) => void;
    }) =>
      createElement("input", {
        value,
        onChange: (event: { target: { value: string } }) =>
          onChangeText(event.target.value),
      }),
    SelectField: () => null,
    SegmentedControl: ({
      options,
      onChange,
    }: {
      options: Array<{ value: string; label: string }>;
      onChange: (value: string) => void;
    }) =>
      createElement(
        "div",
        null,
        options.map((option) =>
          createElement(
            "button",
            { key: option.value, onClick: () => onChange(option.value) },
            option.label,
          ),
        ),
      ),
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
  state.mutations = {};
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function render(Screen: typeof AutomationsScreen) {
  await act(async () => root.render(createElement(Screen)));
}

it("keeps task feedback at the visible record and recovers it at collection level when that record disappears", async () => {
  state.data = [
    { id: "task", title: "Visible task", prompt: "Work", status: "todo" },
  ];
  state.mutations["tasks.move"] = {
    variables: { taskId: "task" },
    error: new Error("Move failed"),
  };
  await render(TasksScreen);
  // TaskCard owns feedback while present; the mocked card deliberately renders no feedback.
  expect(container.textContent).not.toContain("Move failed");
  state.data = [];
  await render(TasksScreen);
  expect(container.textContent).toContain("Move failed");
  expect(state.mutate).not.toHaveBeenCalled();
});

it("retains host update recovery for an off-list declined suggestion", async () => {
  state.mutations["stewards.decline"] = {
    variables: { taskId: "hidden" },
    error: new Error("Unsupported host method"),
  };
  await render(TasksScreen);
  expect(container.textContent).toContain(
    "Update bycoda on this computer to decline suggestions.",
  );
  expect(container.textContent).not.toContain("Unsupported host method");
  expect(state.mutate).not.toHaveBeenCalled();
});
async function search(value: string) {
  await act(async () => {
    const input = container.querySelector("input")!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(label: string) {
  return [...container.querySelectorAll("button")].find(
    (node) => node.textContent === label,
  )!;
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
    expect(container.textContent).not.toMatch(
      /No (automations|project stewards) yet/,
    );
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
      Screen === TasksScreen
        ? "Select a project to add a task."
        : "Choose a project to create",
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
  state.data = [
    {
      id: "existing",
      projectId: "project",
      focus: "Inspect",
      model: "fixture",
    },
  ];
  await render(StewardsScreen);
  expect(container.textContent).not.toContain(
    "This project already has a steward.",
  );
  expect(container.textContent).not.toContain("New project steward");
  expect(button("Edit project steward").disabled).toBe(false);
  await act(async () => button("Edit project steward").click());
  expect(container.textContent).toContain("editing:existing");
  expect(state.mutate).not.toHaveBeenCalled();
});
it.each([
  {
    hostOnline: true,
    stopped: false,
    label: "Computer online",
    stoppedLabel: false,
  },
  {
    hostOnline: true,
    stopped: true,
    label: "Computer online",
    stoppedLabel: true,
  },
  {
    hostOnline: false,
    stopped: false,
    label: "Computer offline",
    stoppedLabel: false,
  },
  {
    hostOnline: false,
    stopped: true,
    label: "Computer offline",
    stoppedLabel: true,
  },
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
    expect(container.textContent?.includes("Sending stopped")).toBe(
      stoppedLabel,
    );
    expect(container.textContent).toContain("Sending authorized");
    expect(container.textContent).not.toContain("Running");
    expect(state.mutate).not.toHaveBeenCalled();
  },
);

it.each(["stewards.save", "stewards.runNow", "stewards.delete"])(
  "keeps %s feedback with its visible record and recovers after removal",
  async (method) => {
    state.data = [
      {
        id: "steward",
        projectId: "project",
        focus: "Inspect compact layout",
        model: "model",
        enabled: true,
      },
    ];
    state.mutations[method] = {
      variables:
        method === "stewards.save"
          ? { steward: { id: "steward" } }
          : { stewardId: "steward" },
      error: new Error("Steward operation failed"),
    };
    await render(StewardsScreen);
    expect(container.querySelector("[data-record]")?.textContent).toContain(
      "Steward operation failed",
    );
    expect(
      container.textContent?.match(/Steward operation failed/g),
    ).toHaveLength(1);
    state.data = [];
    await render(StewardsScreen);
    expect(container.querySelector("[data-record]")).toBeNull();
    expect(
      container.textContent?.match(/Steward operation failed/g),
    ).toHaveLength(1);
    expect(state.mutate).not.toHaveBeenCalled();
  },
);

it("routes crew deletion feedback by record kind as well as id and keeps recovery across tabs", async () => {
  state.data = {
    definitions: [{ id: "same-id", name: "Crew one", agents: [] }],
    agents: [{ id: "same-id", name: "Member one", role: "specialist", candidates: [] }],
    runs: [],
  };
  state.mutations["crews.delete"] = {
    variables: { definitionId: "same-id" },
    error: new Error("Crew deletion failed"),
  };
  state.mutations["crews.agent.delete"] = {
    variables: { agentId: "same-id" },
    error: new Error("Member deletion failed"),
  };
  await render(CrewsScreen);
  expect(
    container.querySelector('[data-record="Crew one"]')?.textContent,
  ).toContain("Crew deletion failed");
  expect(
    container.querySelector('[data-record="Crew one"]')?.textContent,
  ).not.toContain("Member deletion failed");
  expect(container.textContent?.match(/Member deletion failed/g)).toHaveLength(
    1,
  );
  await act(async () => button("Member library").click());
  expect(
    container.querySelector('[data-record="Member one"]')?.textContent,
  ).toContain("Member deletion failed");
  expect(
    container.querySelector('[data-record="Member one"]')?.textContent,
  ).not.toContain("Crew deletion failed");
  expect(container.textContent?.match(/Crew deletion failed/g)).toHaveLength(1);
  state.data = { definitions: [], agents: [], runs: [] };
  await render(CrewsScreen);
  expect(container.querySelector("[data-record]")).toBeNull();
  expect(container.textContent?.match(/Member deletion failed/g)).toHaveLength(
    1,
  );
  expect(state.mutate).not.toHaveBeenCalled();
});


it("retains social operation recovery while the workspace snapshot is unavailable", async () => {
  state.data = null;
  state.mutations["social.request"] = { variables: { action: "jobs.retry", input: { id: "missing-job" } }, error: new Error("Job retry failed") };
  await render(SocialScreen);
  expect(container.textContent?.match(/Job retry failed/g)).toHaveLength(1);
  expect(state.mutate).not.toHaveBeenCalled();
});
