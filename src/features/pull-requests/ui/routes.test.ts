// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PullRequestsScreen } from "./list-screen";
import { PullRequestDetailScreen } from "./detail-screen";
import { useInboxLocalScope } from "../../inbox/inbox-local-scope";
const state = vi.hoisted(() => ({ params: {} as Record<string, string>, machine: "machine", visible: true, available: true, availabilityRetry: vi.fn(), itemRetry: vi.fn(), request: null as unknown, push: vi.fn(), back: vi.fn(), replace: vi.fn(), canGoBack: true, cached: [] as unknown[], readError: null as Error | null, readEnabled: undefined as boolean | undefined }));
const item = { provider: "github", kind: "pr", number: 7, repo: "owner/repo", projectPath: "/repo", title: "Source PR", state: "open", draft: false, updatedAt: "2026-11-17", url: "https://github.com/owner/repo/pull/7", labels: [], assignees: [] };
/** Cache keys mirror useInboxRead: ["machine", id, "provider-inbox", "list", input]. */
const listEntry = (projectId: string | undefined, items: unknown[]) => [["machine", "machine", "provider-inbox", "list", projectId ? { projectId, query: {} } : { query: {} }], { items, errors: {} }];
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ getQueriesData: () => state.cached, getQueryCache: () => ({ subscribe: () => () => {} }) }) }));
vi.mock("@/state/queries", () => ({ hostKey: (machineId: string | null, key: readonly unknown[]) => ["machine", machineId, ...key] }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => state.params, router: { push: state.push, back: state.back, replace: state.replace, canGoBack: () => state.canGoBack }, Stack: { Screen: () => null } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.machine, name: "Computer" }), useMachines: { getState: () => ({ activeId: state.machine, selectedProjectId: "unrelated-project" }) } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/no-computer", () => ({ NoComputerGate: () => createElement("p", null, "Connect a computer first") }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/filter-sheet", () => ({ AppliedFilters: () => null, FilterButton: () => null, FilterSheet: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: { caption: {} } }) }));
vi.mock("@/ui/tokens", () => ({ space: { sm: 8 } }));
vi.mock("../../workspace/use-project-directory", () => ({ useProjectList: () => ({ isProjectVisible: (id: string) => state.visible && id === "project", data: [{ id: "project", name: "Project" }] }) }));
vi.mock("../../inbox/provider-queries", () => ({
  useProviderInboxAvailability: () => ({ data: { available: state.available }, isSuccess: true, refetch: state.availabilityRetry }),
  useInboxRead: (request: unknown, enabled?: boolean) => {
    state.request = request; state.readEnabled = enabled;
    return { data: { items: [item], errors: {} }, error: state.readError, refetch: state.itemRetry, isFetching: false };
  },
}));
vi.mock("../../inbox/provider-detail", () => ({ ProviderInboxDetail: ({ origin }: { origin: { machineId: string; projectId: string | null } }) => {
  const scope = useInboxLocalScope(); return createElement("div", null, scope.matches(origin) ? `authorized:${origin.projectId}` : "denied");
} }));
vi.mock("../../inbox/provider-list", () => ({ ProviderInboxFeedback: () => null, ProviderInboxRow: ({ onOpen }: { onOpen: () => void }) => createElement("button", { onClick: onOpen }, "Open PR") }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Screen: Wrap, Stack: Wrap, Body: Wrap, Row: Wrap, Skeleton: () => createElement("p", null, "Loading"),
    QueryState: ({ query, empty, emptyAction }: { query: { data?: unknown; error?: Error }; empty?: boolean; emptyAction?: { label: string; onPress: () => void } }) => query.error
      ? createElement("p", { role: "alert", "data-cache": query.data !== undefined }, query.error.message)
      : empty && emptyAction ? createElement("button", { onClick: emptyAction.onPress }, emptyAction.label) : null,
    SelectField: () => null, SegmentedControl: () => null, ChoiceChip: () => null, ToggleField: () => null, NavigationGroup: Wrap,
    StateView: ({ title, description, action }: { title: string; description?: string; action?: { label: string; onPress(): void } }) => createElement("div", null, title, description,
      action ? createElement("button", { onClick: action.onPress }, action.label) : null),
    ScreenList: ({ data, header, renderItem }: { data: unknown[]; header: ReactNode; renderItem: (row: { item: unknown }) => ReactNode }) => createElement("div", null, header, ...data.map((item, index) => createElement("div", { key: index }, renderItem({ item })))),
  };
});
let root: ReturnType<typeof createRoot> | undefined, container: HTMLDivElement;
async function render(Component = PullRequestDetailScreen) { await act(async () => root!.render(createElement(Component))); }
async function mount(Component = PullRequestDetailScreen) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); await render(Component); }
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); root = undefined; state.params = {}; state.machine = "machine"; state.visible = true; state.request = null; state.cached = []; state.readError = null; state.canGoBack = true; vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("rechecks desktop availability without reading pull requests from the blocked scope", async () => {
  state.available = false;
  try {
    await mount(PullRequestsScreen);
    const retry = [...container.querySelectorAll("button")].find(button => button.textContent === "Retry");
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    expect(state.availabilityRetry).toHaveBeenCalledOnce();
    expect(state.itemRetry).not.toHaveBeenCalled();
    state.machine = "other";
    await act(async () => retry!.click());
    expect(state.availabilityRetry).toHaveBeenCalledOnce();
  } finally {
    state.available = true;
  }
});
it("keeps route project identity independent of unrelated workspace selection", async () => {
  state.cached = [listEntry("project", [item])];
  state.params = { id: "7", repo: "owner/repo", projectPath: "/repo", machineId: "machine", projectId: "project" };
  await mount(); expect(container.textContent).toContain("authorized:project");
  state.visible = false; await render(); expect(container.textContent).toContain("Pull request access unavailable");
  state.visible = true; state.machine = "other"; await render(); expect(container.textContent).not.toContain("authorized");
});
it("opens an all-project Inbox PR without adopting workspace's selected project", async () => {
  state.cached = [listEntry(undefined, [item])];
  state.params = { id: "7", repo: "owner/repo", projectPath: "/repo", machineId: "machine", projectId: "" };
  await mount(); expect(container.textContent).toContain("authorized:null");
  state.params = { ...state.params, id: "8" }; await render(); expect(container.textContent).toContain("Could not open pull request");
});
it("queries the explicit project and carries its exact scope into detail navigation", async () => {
  state.params = { projectId: "project", machineId: "machine" };
  await mount(PullRequestsScreen);
  expect(state.request).toMatchObject({ action: "list", input: { projectId: "project", query: { providers: ["github"], githubKinds: ["pr"] } } });
  await act(async () => container.querySelector("button")!.click());
  expect(state.push).toHaveBeenCalledWith({ pathname: "/pull-requests/[id]", params: { id: "7", repo: "owner/repo", projectPath: "/repo", machineId: "machine", projectId: "project" } });
});
it.each(["auth", "identity"])("explains a %s failure and conceals cached pull requests", async kind => {
  state.params = { projectId: "project", machineId: "machine" };
  await mount(PullRequestsScreen);
  expect(container.textContent).toContain("Open PR");

  state.readError = Object.assign(new Error("Pull request access could not be verified"), { kind });
  await render(PullRequestsScreen);
  expect(container.textContent).not.toContain("Open PR");
  const alert = container.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe("Pull request access could not be verified");
  expect(alert?.getAttribute("data-cache")).toBe("false");

  state.readError = null;
  await render(PullRequestsScreen);
  expect(container.textContent).toContain("Open PR");
});
it("retains prior pull requests when an ordinary refresh fails", async () => {
  state.params = { projectId: "project", machineId: "machine" };
  state.readError = new Error("Could not refresh pull requests");
  await mount(PullRequestsScreen);
  expect(container.textContent).toContain("Open PR");
  expect(container.querySelector('[role="alert"]')?.getAttribute("data-cache")).toBe("true");
});
it("opens a large PR from its cached list row, not from a serialised route snapshot", async () => {
  const large = { ...item, labels: Array.from({ length: 400 }, (_, index) => ({ name: `label-${index}-${"x".repeat(80)}`, color: "ffffff" })) };
  state.cached = [listEntry("project", [large])];
  state.params = { id: "7", repo: "owner/repo", projectPath: "/repo", machineId: "machine", projectId: "project" };
  await mount(); expect(container.textContent).toContain("authorized:project");
});
it("reports malformed or uncached routes as unopenable, not as an access problem", async () => {
  state.cached = [listEntry("project", [item])];
  state.params = { id: "07", repo: "owner/repo", projectPath: "/repo", machineId: "machine", projectId: "project" };
  await mount(); expect(container.textContent).toContain("Could not open pull request");
  state.params = { id: "7", repo: "owner/repo", projectPath: "/other", machineId: "machine", projectId: "project" }; await render();
  expect(container.textContent).toContain("Could not open pull request");
});
it("does not match a cached PR from another project scope", async () => {
  state.cached = [listEntry(undefined, [item])];
  state.params = { id: "7", repo: "owner/repo", projectPath: "/repo", machineId: "machine", projectId: "project" };
  await mount(); expect(container.textContent).toContain("Could not open pull request");
});
it("returns an uncached detail to the scoped list when it has no back history", async () => {
  state.canGoBack = false;
  state.params = { id: "7", repo: "owner/repo", projectPath: "/repo", machineId: "machine", projectId: "project" };
  await mount();
  const action = container.querySelector("button");
  expect(action?.textContent).toBe("Pull requests");
  await act(async () => action?.click());
  expect(state.back).not.toHaveBeenCalled();
  expect(state.replace).toHaveBeenCalledExactlyOnceWith({ pathname: "/pull-requests", params: { machineId: "machine", projectId: "project" } });
});
it("offers Back for a detail that belongs to a different computer", async () => {
  state.params = { id: "7", repo: "owner/repo", projectPath: "/repo", machineId: "other", projectId: "project" };
  await mount();
  const action = container.querySelector("button");
  expect(action?.textContent).toBe("Go back");
  await act(async () => action?.click());
  expect(state.back).toHaveBeenCalledOnce();
  expect(state.replace).not.toHaveBeenCalled();
});
it("runs the list's own scoped read for a cold-start detail and explains where to open it when the PR is not there", async () => {
  state.params = { id: "7", repo: "owner/repo", projectPath: "/repo", machineId: "machine", projectId: "project" };
  await mount();
  expect(state.readEnabled).toBe(true);
  expect(state.request).toMatchObject({ action: "list", input: { projectId: "project", query: { providers: ["github"], githubKinds: ["pr"] } } });
  expect(container.textContent).toContain("Open it from the pull request list.");
  state.cached = [listEntry("project", [item])];
  await render();
  expect(state.readEnabled).toBe(false);
  expect(container.textContent).toContain("authorized:project");
});
