// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMachines } from "@/state/machines";
import { ActiveSessionsScreen } from "./active-sessions-screen";
vi.mock("@/ui/no-computer", () => ({ NoComputerState: () => null, NoComputerGate: () => null }));

vi.mock("@/ui/swipe-actions", () => ({
  SwipeActionsGroup: ({ children }: { children: ReactNode }) => children,
}));

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  openInSplit: vi.fn(),
  row: undefined as { open: () => void; canRead: () => boolean } | undefined,
  readable: true,
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock("expo-router", () => ({ router: { navigate: fixture.navigate }, Stack: { Screen: () => null } }));
vi.mock("react-native", () => ({ View: ({ children }: { children: ReactNode }) => h("div", null, children) }));
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
  ScreenList: ({ data, renderItem }: {
    data: { key: string }[];
    renderItem: (entry: { item: { key: string } }) => ReactNode;
  }) => h("div", null, data.map((item) => h("div", { key: item.key }, renderItem({ item })))),
}));
vi.mock("@/ui/filter-sheet", () => ({ AppliedFilters: () => null, FilterButton: () => null, FilterChipRow: () => null, FilterSheet: () => null }));
vi.mock("./project-scope-pill", () => ({ ProjectScopePill: () => null }));
vi.mock("@/ui/hierarchy-frame", () => ({
  HierarchyWidthProvider: ({ children }: { children: ReactNode }) => children,
  HierarchyFrame: ({ children }: { children: (frame: { indent: number; compressed: boolean }) => ReactNode }) =>
    children({ indent: 0, compressed: false }),
}));
vi.mock("./new-session-sheet", () => ({ NewSessionSheet: () => null }));
vi.mock("./project-directory-feedback", () => ({ ProjectDirectoryFeedback: () => null }));
vi.mock("./session-clock", () => ({ useSnoozeNow: () => Date.now() }));
vi.mock("./session-done-store", () => ({ useUnseenDoneIds: () => new Set() }));
vi.mock("./session-shelf-header", () => ({ SessionShelfHeader: () => null }));
vi.mock("./session-folder-row", () => ({ SessionFolderRow: () => null }));
vi.mock("./session-list-row", () => ({
  SessionListRow: ({ session, projectId, onPress, canRead }: {
    session: { id: string };
    projectId: string;
    onPress: (id: string, projectId: string) => void;
    canRead: (projectId: string) => boolean;
  }) => {
    fixture.row = { open: () => onPress(session.id, projectId), canRead: () => canRead(projectId) };
    return h("button", { onClick: fixture.row.open }, "Open session");
  },
}));
vi.mock("./use-project-activity", () => ({
  useProjectActivity: () => ({
    projects: { data: [project], isProjectVisible: () => fixture.readable },
    directory: [{ project, session }],
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
  setComputer(firstComputer);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("rejects a retained row on the global list after switching computers", async () => {
  await act(async () => root.render(h(ActiveSessionsScreen, { overview: true })));
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
  await act(async () => root.render(h(ActiveSessionsScreen, { overview: true, urgency: true, onOpenSession: fixture.openInSplit })));
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
  await act(async () => root.render(h(ActiveSessionsScreen, { overview: true })));
  fixture.readable = false;
  await act(async () => fixture.row!.open());
  expect(fixture.navigate).not.toHaveBeenCalled();
});
