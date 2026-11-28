// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMachines } from "@/state/machines";
import { ActiveSessionsScreen } from "./active-sessions-screen";
vi.mock("@/ui/no-computer", () => ({ NoComputerState: () => null, NoComputerGate: () => null }));

vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));
vi.mock("@/ui/screen-content-insets", () => ({ useScreenContentInsets: () => ({ left: 16, right: 16, bottom: 0 }) }));
vi.mock("./new-chat-navigation", () => ({ openNewChat: fixture.openNewChat }));
vi.mock("./session-filter-chip", () => ({ SessionFilterChip: () => null }));
vi.mock("../navigation-prefs/app-preferences", async () => {
  const { create } = await import("zustand");
  type View = { density: string; groupByProject: boolean; projectByMachine: Record<string, string>; collapsed: Record<string, boolean> };
  const store = create(() => ({ sessions: { density: "standard", groupByProject: false, projectByMachine: {}, collapsed: {} } as View }));
  fixture.prefs = store;
  const updateSessionListPreferences = async (patch: Partial<View> | ((current: View) => Partial<View>)) =>
    store.setState((state) => ({ sessions: { ...state.sessions, ...(typeof patch === "function" ? patch(state.sessions) : patch) } }));
  return {
    useAppPreferences: () => ({ preferences: store(), hydrated: true }),
    sessionListProject: (view: View, machineId?: string) => (machineId && view.projectByMachine[machineId]) || null,
    updateSessionListPreferences,
    setSessionListProject: (machineId: string, projectId: string | null) => updateSessionListPreferences((current) => {
      const projectByMachine = { ...current.projectByMachine };
      if (projectId) projectByMachine[machineId] = projectId; else delete projectByMachine[machineId];
      return { projectByMachine };
    }),
  };
});
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/swipe-actions", () => ({
  SwipeActionsGroup: ({ children }: { children: ReactNode }) => children,
}));

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  openInSplit: vi.fn(),
  openNewChat: vi.fn(),
  row: undefined as { open: () => void; canRead: () => boolean } | undefined,
  readable: true,
  prefs: undefined as unknown as { setState: (state: object) => void; getState: () => { sessions: Record<string, unknown> } },
  directory: [] as { project: { id: string; name: string; cwd: string }; session: Record<string, unknown> }[],
  projects: [] as { id: string; name: string; cwd: string }[],
  projectHeaders: [] as string[],
  shelfHeaders: [] as string[],
  scopeChange: undefined as ((projectId: string | null) => void) | undefined,
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock("expo-router", () => ({ router: { navigate: fixture.navigate }, Stack: { Screen: () => null } }));
vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => h("div", null, children),
  ScrollView: ({ children }: { children: ReactNode }) => h("div", null, children),
}));
vi.mock("@/state/machines", async () => {
  const { create } = await import("zustand");
  const useMachines = create(() => ({ activeId: "first", machines: [] as (typeof firstComputer)[], hydrated: true }));
  return { useMachines, useActiveMachine: () => useMachines((state) => state.machines.find(({ id }) => id === state.activeId)) };
});
vi.mock("@/state/queries", () => ({ useHostQuery: () => ({}), useHostReadActive: () => true }));
vi.mock("@/state/actions", () => ({ useAsyncAction: () => ({ isPending: false }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({
  SearchToolbar: () => null,
  Row: () => null,
  ChoiceChip: () => null,
  SectionHeader: () => null,
  SearchField: () => null,
  IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => h("button", { "aria-label": label, onClick: onPress }),
  SegmentedControl: () => null,
  ToggleField: () => null,
  SelectField: () => null,
  MultiSelectField: () => null,
  useCollapsibleSearch: () => ({ open: false, trigger: null, filterTrigger: null, sheet: null, field: null }),
  ScreenList: ({ data, renderItem, header, actions }: {
    data: { key: string }[];
    renderItem: (entry: { item: { key: string } }) => ReactNode;
    header?: ReactNode;
    actions?: ReactNode;
  }) => h("div", null, ...data.map((item) => h("div", { key: item.key }, renderItem({ item }))), h("div", { key: "header" }, header), h("div", { key: "actions" }, actions)),
}));
vi.mock("@/ui/filter-sheet", () => ({ AppliedFilters: () => null, FilterButton: () => null, FilterChipRow: () => null, FilterSheet: () => null }));
vi.mock("./project-scope-pill", () => ({
  ProjectScopePill: ({ onChange }: { onChange: (projectId: string | null) => void }) => { fixture.scopeChange = onChange; return null; },
}));
vi.mock("@/ui/hierarchy-frame", () => ({
  HierarchyWidthProvider: ({ children }: { children: ReactNode }) => children,
  HierarchyFrame: ({ children }: { children: (frame: { indent: number; compressed: boolean }) => ReactNode }) =>
    children({ indent: 0, compressed: false }),
}));
vi.mock("./new-session-sheet", () => ({ NewSessionSheet: () => null }));
vi.mock("./project-directory-feedback", () => ({ ProjectDirectoryFeedback: () => null }));
vi.mock("./session-clock", () => ({ useSnoozeNow: () => Date.now() }));
vi.mock("./session-done-store", () => ({ useUnseenDoneIds: () => new Set() }));
vi.mock("./session-shelf-header", () => ({
  SessionShelfHeader: ({ row }: { row: { shelf: string } }) => { fixture.shelfHeaders.push(row.shelf); return null; },
  SessionProjectHeader: ({ row }: { row: { project: { id: string } } }) => { fixture.projectHeaders.push(row.project.id); return null; },
}));
vi.mock("./session-folder-row", () => ({ SessionFolderRow: () => null }));
vi.mock("./session-list-row", () => ({
  SessionListRow: ({ session, projectId, onPress, canRead }: {
    session: { id: string };
    projectId: string;
    onPress: (id: string, projectId: string) => void;
    canRead: (projectId: string) => boolean;
  }) => {
    fixture.row = { open: () => onPress(session.id, projectId), canRead: () => canRead(projectId) };
    return h("button", { onClick: fixture.row.open, "data-session": session.id }, "Open session");
  },
}));
vi.mock("./use-project-activity", () => ({
  useProjectActivity: () => ({
    projects: { data: fixture.projects, isProjectVisible: () => fixture.readable },
    directory: fixture.directory,
    directoryReady: true,
  }),
}));

const project = { id: "shared-project", name: "Project", cwd: "/project" };
const session = { id: "shared-session", projectId: project.id, title: "Session", status: "idle", updatedAt: Date.now() };
const firstComputer = { id: "first", name: "First", endpoint: "https://first.test", environmentId: "a", lanKey: "a" };
const secondComputer = { id: "second", name: "Second", endpoint: "https://second.test", environmentId: "b", lanKey: "b" };

const setComputer = (machine: typeof firstComputer) => useMachines.setState({
  activeId: machine.id,
  machines: [machine] as ReturnType<typeof useMachines.getState>["machines"],
});
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  fixture.row = undefined;
  fixture.readable = true;
  fixture.projects = [project];
  fixture.directory = [{ project, session }];
  fixture.projectHeaders = [];
  fixture.shelfHeaders = [];
  fixture.prefs.setState({ sessions: { density: "standard", groupByProject: false, projectByMachine: {}, collapsed: {} } });
  setComputer(firstComputer);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("rejects a retained row on the global list after switching computers", async () => {
  await act(async () => root.render(h(ActiveSessionsScreen, {})));
  const original = fixture.row!;
  await act(async () => setComputer(secondComputer));
  await act(async () => original.open());
  expect(fixture.navigate).not.toHaveBeenCalled();
  expect(original.canRead()).toBe(false);

  await act(async () => container.querySelector("button")!.click());
  expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith({ pathname: "/session/[id]", params: {
    id: session.id, projectId: project.id, machineId: secondComputer.id,
  } });
});

it("only lets the currently reviewed row replace the split detail after re-pairing", async () => {
  await act(async () => root.render(h(ActiveSessionsScreen, { urgency: true, onOpenSession: fixture.openInSplit })));
  const original = fixture.row!;
  await act(async () => setComputer({ ...firstComputer }));
  await act(async () => original.open());
  expect(fixture.openInSplit).toHaveBeenCalledExactlyOnceWith(session.id, project.id, firstComputer.id);
  fixture.openInSplit.mockClear();

  await act(async () => setComputer({ ...secondComputer, id: firstComputer.id }));
  await act(async () => original.open());
  expect(fixture.openInSplit).not.toHaveBeenCalled();
  expect(original.canRead()).toBe(false);

  await act(async () => container.querySelector("button")!.click());
  expect(fixture.openInSplit).toHaveBeenCalledExactlyOnceWith(session.id, project.id, firstComputer.id);
});

it("rechecks project visibility before opening a session", async () => {
  await act(async () => root.render(h(ActiveSessionsScreen, {})));
  fixture.readable = false;
  await act(async () => fixture.row!.open());
  expect(fixture.navigate).not.toHaveBeenCalled();
});

const other = { id: "other-project", name: "Other", cwd: "/other" };
const otherSession = { id: "other-session", projectId: other.id, title: "Other", status: "idle", updatedAt: Date.now() - 1000 };
const shownSessions = () => [...container.querySelectorAll("[data-session]")].map((node) => node.getAttribute("data-session"));

it("lists every project's sessions whatever project Tools selected app-wide", async () => {
  fixture.projects = [project, other];
  fixture.directory = [{ project, session }, { project: other, session: otherSession }];
  useMachines.setState({ selectedProjectId: other.id } as never);
  await act(async () => root.render(h(ActiveSessionsScreen, {})));
  expect(shownSessions()).toEqual([session.id, otherSession.id]);
  expect(fixture.shelfHeaders).toContain("recent");
});

it("narrows to the Sessions project filter of this computer only and starts new sessions there", async () => {
  fixture.projects = [project, other];
  fixture.directory = [{ project, session }, { project: other, session: otherSession }];
  await act(async () => root.render(h(ActiveSessionsScreen, {})));
  await act(async () => fixture.scopeChange!(other.id));
  expect(shownSessions()).toEqual([otherSession.id]);
  await act(async () => (container.querySelector("[aria-label='New session']") as HTMLButtonElement).click());
  expect(fixture.openNewChat).toHaveBeenCalledExactlyOnceWith({ projectId: other.id });

  await act(async () => setComputer(secondComputer));
  expect(shownSessions()).toEqual([session.id, otherSession.id]);
  await act(async () => setComputer(firstComputer));
  await act(async () => (container.querySelector("[aria-label='Reset project and status']") as HTMLButtonElement).click());
  expect(shownSessions()).toEqual([session.id, otherSession.id]);
  expect(fixture.prefs.getState().sessions.projectByMachine).toEqual({});
});

it("ignores a saved project that is no longer on the computer", async () => {
  fixture.prefs.setState({ sessions: { density: "standard", groupByProject: false, projectByMachine: { first: "gone" }, collapsed: {} } });
  await act(async () => root.render(h(ActiveSessionsScreen, {})));
  expect(shownSessions()).toEqual([session.id]);
  expect(container.querySelector("[aria-label='Reset project and status']")).toBeNull();
});

it("groups sessions under project headers ordered by latest activity", async () => {
  fixture.projects = [project, other];
  fixture.directory = [{ project: other, session: otherSession }, { project, session }];
  fixture.prefs.setState({ sessions: { density: "compact", groupByProject: true, projectByMachine: {}, collapsed: { "project:other-project": true } } });
  await act(async () => root.render(h(ActiveSessionsScreen, {})));
  expect([...new Set(fixture.projectHeaders)]).toEqual([project.id, other.id]);
  expect(shownSessions()).toEqual([session.id]);
});
