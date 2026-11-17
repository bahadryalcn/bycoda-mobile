// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PullRequestsScreen } from "./list-screen";
import { PullRequestDetailScreen } from "./detail-screen";
import { useInboxLocalScope } from "../../inbox/inbox-local-scope";
const state = vi.hoisted(() => ({ params: {} as Record<string, string>, machine: "machine", visible: true, request: null as unknown, push: vi.fn() }));
const item = { provider: "github", kind: "pr", number: 7, repo: "owner/repo", projectPath: "/repo", title: "Source PR", state: "open", draft: false, updatedAt: "2026-11-17", url: "https://github.com/owner/repo/pull/7", labels: [], assignees: [] };
vi.mock("expo-router", () => ({ useLocalSearchParams: () => state.params, router: { push: state.push, back: vi.fn() }, Stack: { Screen: () => null } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.machine, name: "Computer" }), useMachines: { getState: () => ({ activeId: state.machine, selectedProjectId: "unrelated-project" }) } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }) }));
vi.mock("../../workspace/use-project-directory", () => ({ useProjectList: () => ({ isProjectVisible: (id: string) => state.visible && id === "project", data: [{ id: "project", name: "Project" }] }) }));
vi.mock("../../inbox/provider-queries", () => ({ useProviderInboxAvailability: () => ({ data: { available: true }, isSuccess: true }), useInboxRead: (request: unknown) => { state.request = request; return { data: { items: [item], errors: {} }, refetch: vi.fn(), isFetching: false }; } }));
vi.mock("../../inbox/provider-detail", () => ({ ProviderInboxDetail: ({ origin }: { origin: { machineId: string; projectId: string | null } }) => {
  const scope = useInboxLocalScope(); return createElement("div", null, scope.matches(origin) ? `authorized:${origin.projectId}` : "denied");
} }));
vi.mock("../../inbox/provider-list", () => ({ ProviderInboxFeedback: () => null, ProviderInboxRow: ({ onOpen }: { onOpen: () => void }) => createElement("button", { onClick: onOpen }, "Open PR") }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Screen: Wrap, Stack: Wrap, Body: Wrap, Row: Wrap, QueryState: () => null, SelectField: () => null, SegmentedControl: () => null, ChoiceChip: () => null,
    StateView: ({ title }: { title: string }) => createElement("div", null, title),
    ScreenList: ({ data, header, renderItem }: { data: unknown[]; header: ReactNode; renderItem: (row: { item: unknown }) => ReactNode }) => createElement("div", null, header, ...data.map((item, index) => createElement("div", { key: index }, renderItem({ item })))),
  };
});
let root: ReturnType<typeof createRoot> | undefined, container: HTMLDivElement;
async function render(Component = PullRequestDetailScreen) { await act(async () => root!.render(createElement(Component))); }
async function mount(Component = PullRequestDetailScreen) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); await render(Component); }
afterEach(async () => { await act(async () => root?.unmount()); container?.remove(); root = undefined; state.params = {}; state.machine = "machine"; state.visible = true; state.request = null; vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("keeps route project identity independent of unrelated workspace selection", async () => {
  state.params = { id: "7", item: JSON.stringify(item), machineId: "machine", projectId: "project" };
  await mount(); expect(container.textContent).toContain("authorized:project");
  state.visible = false; await render(); expect(container.textContent).toContain("Pull request access unavailable");
  state.visible = true; state.machine = "other"; await render(); expect(container.textContent).not.toContain("authorized");
});
it("opens an all-project Inbox PR without adopting workspace's selected project", async () => {
  state.params = { id: "7", item: JSON.stringify(item), machineId: "machine", projectId: "" };
  await mount(); expect(container.textContent).toContain("authorized:null");
  state.params = { ...state.params, id: "8" }; await render(); expect(container.textContent).toContain("Pull request access unavailable");
});
it("queries the explicit project and carries its exact scope into detail navigation", async () => {
  state.params = { projectId: "project", machineId: "machine" };
  await mount(PullRequestsScreen);
  expect(state.request).toMatchObject({ action: "list", input: { projectId: "project", query: { providers: ["github"], githubKinds: ["pr"] } } });
  await act(async () => container.querySelector("button")!.click());
  expect(state.push).toHaveBeenCalledWith({ pathname: "/pull-requests/[id]", params: { id: "7", item: JSON.stringify(item), machineId: "machine", projectId: "project" } });
});
