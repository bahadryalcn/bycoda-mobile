// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DirectoryProject } from "./project-directory";
import { ProjectsScreen } from "./projects-screen";

vi.mock("@/ui/swipe-actions", () => ({
  SwipeActionsGroup: ({ children }: { children: ReactNode }) => children,
}));

const f = vi.hoisted(() => ({
  navigate: vi.fn(),
  selectProject: vi.fn(),
  open: vi.fn<(payload: { cwd: string }) => Promise<DirectoryProject>>(),
  success: vi.fn(),
  rowDetails: undefined as (() => void) | undefined,
  detailsFiles: undefined as (() => void) | undefined,
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock("expo-router", () => ({ router: { navigate: f.navigate }, Stack: { Screen: () => null } }));
vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => h("div", null, children),
  FlatList: ({ data, renderItem }: { data: unknown[]; renderItem: (entry: { item: unknown; index: number }) => ReactNode }) =>
    h("div", null, data.map((item, index) => h("div", { key: index }, renderItem({ item, index })))),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => null } }));
vi.mock("@/state/machines", async () => {
  const { create } = await import("zustand");
  const useMachines = create(() => ({ activeId: "phone", machines: [] as (typeof firstComputer)[], selectProject: f.selectProject }));
  return { useMachines, useActiveMachine: () => useMachines((state) => state.machines.find((machine) => machine.id === state.activeId)) };
});
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({}),
  useHostMutation: () => ({ isPending: false, mutateAsync: f.open }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ haptic: { success: f.success } }));
vi.mock("@/ui/scroll-keyboard", () => ({ scrollKeyboardDismissMode: () => "on-drag" }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/screen-content-insets", () => ({ useScreenContentInsets: () => ({ left: 0, right: 0 }) }));
vi.mock("@/ui/primitives", () => {
  const controls = ["Button", "IconButton", "ScreenHeading", "MutationState", "Notice", "SearchField", "Row", "Sheet", "SelectField", "SegmentedControl", "ToggleField"];
  return {
    Screen: ({ children }: { children: ReactNode }) => h("div", null, children),
    ...Object.fromEntries(controls.map((name) => [name, () => null])),
  };
});
vi.mock("lucide-react-native/icons/folder-plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/sliders-horizontal", () => ({ default: () => null }));
vi.mock("./project-directory-feedback", () => ({ ProjectDirectorySlot: () => null }));
vi.mock("./project-folder-browser", () => ({ ProjectFolderBrowser: () => null }));
vi.mock("./project-reorder-sheet", () => ({ ProjectReorderSheet: () => null, ProjectReorderAction: () => null }));
vi.mock("./use-project-activity", () => ({ useProjectActivity: () => ({ directory: [] }) }));
vi.mock("../group-lock/group-lock-section", () => ({ GroupLockSection: () => null }));
vi.mock("../connections/welcome-screen", () => ({ WelcomeScreen: () => null }));
vi.mock("../navigation-prefs/app-preferences", () => ({ appPreferences: {}, useAppPreferences: () => ({ preferences: { groupByRepository: false } }) }));
vi.mock("./use-project-directory", async () => {
  const { useActiveMachine } = await import("@/state/machines");
  return { useProjectDirectory: () => {
    const machine = useActiveMachine();
    return {
      query: { isSuccess: true },
      projects: machine ? [project(machine.name, registered)] : [],
      groups: [],
      directoryReady: true,
      isProjectVisible: () => true,
    };
  } };
});
vi.mock("./project-row", () => ({
  ProjectGroupHeader: () => null,
  ProjectRow: ({ id, name, onPress, onDetails }: { id: string; name: string; onPress: (id: string) => void; onDetails: (id: string) => void }) => {
    f.rowDetails = () => onDetails(id);
    return h("div", null, h("button", { onClick: () => onPress(id) }, name), h("button", { onClick: f.rowDetails }, "Details"));
  },
}));
vi.mock("./project-details-sheet", () => ({
  ProjectDetailsSheet: ({ project, onOpenView }: { project: DirectoryProject; onOpenView: (view: "files") => void }) => {
    f.detailsFiles = () => onOpenView("files");
    return h("section", null, project.cwd, h("button", { onClick: f.detailsFiles }, "Files"));
  },
}));

const firstComputer = { id: "phone", endpoint: "https://first.test", environmentId: "first", lanKey: "first-key", name: "First" };
const secondComputer = { id: "phone", endpoint: "https://second.test", environmentId: "second", lanKey: "second-key", name: "Second" };
const project = (name: string, registered: boolean): DirectoryProject => ({ id: "shared-id", cwd: `/${name}`, name, registered });
let registered = true;
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const click = (label: string) => {
  const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
  expect(button).toBeDefined();
  button?.click();
};
const setComputer = async (machine: typeof firstComputer) => {
  const { useMachines } = await import("@/state/machines");
  // The mock intentionally models only the reviewed identity fields the screen uses.
  useMachines.setState({ activeId: machine.id, machines: [machine] as ReturnType<typeof useMachines.getState>["machines"] });
};

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  f.rowDetails = undefined;
  f.detailsFiles = undefined;
  registered = true;
  await setComputer(firstComputer);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it.each([
  { change: "same-ID re-pairing", machine: secondComputer },
  { change: "a computer switch", machine: { ...secondComputer, id: "second-phone" } },
])("retires a project details sheet and retained row callbacks after $change", async ({ machine }) => {
  await act(async () => root.render(h(ProjectsScreen)));
  await act(async () => click("Details"));
  expect(container.querySelector("section")?.textContent).toContain("/First");
  const openFirstFiles = f.detailsFiles!;
  const openFirstDetails = f.rowDetails!;

  // Ordinary machine object refresh preserves the sheet.
  await act(async () => setComputer({ ...firstComputer }));
  expect(container.querySelector("section")?.textContent).toContain("/First");
  await act(async () => setComputer(machine));
  expect(container.querySelector("section")).toBeNull();
  await act(async () => { openFirstFiles(); openFirstDetails(); });
  expect(container.querySelector("section")).toBeNull();
  expect(f.navigate).not.toHaveBeenCalled();

  await act(async () => click("Details"));
  expect(container.querySelector("section")?.textContent).toContain("/Second");
  await act(async () => click("Files"));
  expect(f.selectProject).toHaveBeenCalledWith("shared-id");
  expect(f.navigate).toHaveBeenCalledExactlyOnceWith({
    pathname: "/project/[id]",
    params: { id: "shared-id", machineId: machine.id, view: "files" },
  });
});

it("ignores a late open receipt from the retired connection", async () => {
  registered = false;
  const receipt = Promise.withResolvers<DirectoryProject>();
  f.open.mockReturnValueOnce(receipt.promise);
  await act(async () => root.render(h(ProjectsScreen)));
  await act(async () => click("First"));
  expect(f.open).toHaveBeenCalledWith({ cwd: "/First" });
  await act(async () => setComputer(secondComputer));
  await act(async () => receipt.resolve(project("First", true)));
  expect(f.navigate).not.toHaveBeenCalled();
  expect(f.selectProject).not.toHaveBeenCalled();
  expect(f.success).not.toHaveBeenCalled();
});

it("opens a discovered project once for two rapid presses", async () => {
  registered = false;
  const receipt = Promise.withResolvers<DirectoryProject>();
  f.open.mockReturnValue(receipt.promise);
  await act(async () => root.render(h(ProjectsScreen)));
  await act(async () => { click("First"); click("First"); });
  await act(async () => receipt.resolve(project("First", true)));
  expect(f.open).toHaveBeenCalledOnce();
  expect(f.navigate).toHaveBeenCalledOnce();
});
