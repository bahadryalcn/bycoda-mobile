// @vitest-environment happy-dom
import { act, createElement as h, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ManagementHome, ManagementScreen } from "./index";
import { useLocalProjectScope } from "./shared/local-project-scope";
import ManagementRoute from "../../../app/manage/[section]";

const fixture = vi.hoisted(() => {
  const value = {
    token: "original-pairing", activeId: "same-row", params: {},
    directoryReady: true, projects: ["workspace-project", "other-project"],
    selected: "workspace-project" as string | null,
    navigate: vi.fn(), selectProject: vi.fn(),
  };
  value.selectProject = vi.fn((id: string | null) => { value.selected = id; });
  return value;
});
vi.mock("@/ui/no-computer", () => ({ NoComputerState: () => h("p", null, "Connect a computer first"), NoComputerGate: () => h("p", null, "Connect a computer first") }));
vi.mock("./pull-request-icon", () => ({ PullRequestIcon: () => null }));
vi.mock("expo-router", () => ({ router: { navigate: fixture.navigate }, Stack: { Screen: () => null }, useLocalSearchParams: () => fixture.params }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: fixture.activeId }),
  useMachines: Object.assign((select: (state: { activeId: string; hydrated: boolean; selectedProjectId: string | null; machines: { id: string; name: string }[] }) => unknown) =>
    select({ activeId: fixture.activeId, hydrated: true, selectedProjectId: fixture.selected, machines: [{ id: "same-row", name: "Origin computer" }] }),
  { getState: () => ({ activeId: fixture.activeId, selectedProjectId: fixture.selected, selectProject: fixture.selectProject }) }),
}));
vi.mock("@/state/connection-scope", () => {
  const current = { get token() { return fixture.token; }, isCurrent: () => true };
  return { useConnectionScope: () => current };
});
vi.mock("@/ui/primitives", () => ({ RowIcon: () => null,
  Screen: ({ children, scopeControl }: PropsWithChildren<{ scopeControl?: React.ReactNode }>) => h("div", null, scopeControl, children),
  SearchField: () => null,
  useCollapsibleSearch: () => ({ open: false, trigger: null, field: null }),
  NavigationGroup: ({ children }: PropsWithChildren) => children,
  Section: ({ children }: PropsWithChildren) => children,
  NavigationRow: ({ label, onPress }: { label: string; onPress: () => void }) => h("button", { onClick: onPress }, label),
  StateView: ({ title, action }: { title: string; action: { label: string } }) => h("p", null, title, " ", action.label),
}));
vi.mock("@/ui/duotone-icon", () => Object.fromEntries(
  "FolderOpen GitBranch MessagesSquare CheckSquare Target Users Clock NotebookPen Bot Activity Layers Plug KeyRound ShieldCheck Server ScrollText Smartphone Globe Terminal ChartColumn".split(" ").map((name) => [name, () => null]),
));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("../workspace/project-scope-pill", () => ({
  ProjectScopePill: ({ onChange }: { onChange: (id: string | null) => void }) => h("button", { onClick: () => onChange(null) }, "All projects"),
}));
vi.mock("../workspace/use-project-directory", () => ({
  useProjectList: () => ({ directoryReady: fixture.directoryReady, data: fixture.projects.map((id) => ({ id })) }),
}));
vi.mock("../workspace/project-picker", () => ({
  ProjectPicker: ({ onSelect }: { onSelect: (project: { id: string }) => void }) => h("button", { onClick: () => onSelect({ id: "other-project" }) }, "Choose another project"),
}));
vi.mock("./crews-screen", () => ({ CrewsScreen: () => null }));
vi.mock("./automations-screen", () => ({ AutomationsScreen: () => null }));
vi.mock("./notes-screen", () => ({ NotesScreen: () => null }));
vi.mock("./inbox-screen", () => ({ InboxScreen: () => null }));
vi.mock("./stewards-screen", () => ({ StewardsScreen: () => null }));
vi.mock("./tasks-screen", () => ({ TasksScreen: EditorFixture }));
vi.mock("./goals-screen", () => ({ GoalsScreen: EditorFixture }));

function EditorFixture() {
  const [open, setOpen] = useState(false);
  const { projectId } = useLocalProjectScope();
  return h("button", { onClick: () => setOpen(true), "data-project": projectId ?? "all" }, open ? "Private open draft" : "Open editor");
}

it.each(["loading", "withdrawn"] as const)("never reads an unproven project when the Tools selection is %s", async (state) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const surface = document.createElement("div");
  const root = createRoot(surface);
  const render = () => act(async () => root.render(h(ManagementHome)));
  const click = (label: string) => act(async () => {
    const button = Array.from(surface.querySelectorAll("button")).find((item) => item.textContent === label);
    expect(button).toBeDefined();
    button?.click();
  });
  fixture.navigate.mockClear();
  try {
    await render();
    if (state === "loading") fixture.directoryReady = false;
    else fixture.projects = ["other-project"];
    await render();
    await click("Tasks");
    if (state === "withdrawn") {
      // A project the computer no longer lists is never read: the directory falls back without asking.
      expect(fixture.navigate).toHaveBeenLastCalledWith(expect.objectContaining({
        params: expect.objectContaining({ section: "tasks", projectFilter: "project", projectId: "other-project" }),
      }));
      return;
    }
    expect(fixture.navigate).not.toHaveBeenCalled();
    fixture.directoryReady = true;
    await render();
    await click("Choose another project");
    expect(fixture.navigate).toHaveBeenLastCalledWith(expect.objectContaining({
      params: expect.objectContaining({ section: "tasks", projectFilter: "project", projectId: "other-project" }),
    }));
    // The Tools directory requires a project: All projects is never applied from its pill.
    await render();
    await click("All projects");
    expect(fixture.selected).toBe("other-project");
    // With the shared selection at All it opens tools for the fallback project without asking.
    fixture.selected = null;
    fixture.navigate.mockClear();
    await render();
    await click("Tasks");
    expect(fixture.navigate).toHaveBeenLastCalledWith(expect.objectContaining({
      params: expect.objectContaining({ section: "tasks", projectFilter: "project", projectId: "other-project" }),
    }));
  } finally {
    fixture.directoryReady = true;
    fixture.projects = ["workspace-project", "other-project"];
    fixture.selected = "workspace-project";
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("keeps a linked task on its origin when the active computer changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const surface = document.createElement("div");
  const root = createRoot(surface);
  const render = () => act(async () => root.render(h(ManagementRoute)));
  fixture.params = { section: "tasks", taskId: "linked-task", machineId: "same-row" };
  try {
    await render();
    expect(surface.textContent).toBe("Open editor");
    fixture.activeId = "other-computer";
    await render();
    expect(surface.textContent).toContain("Choose computer");
    expect(surface.querySelector("button")).toBeNull();
    fixture.activeId = "same-row";
    await render();
    expect(surface.textContent).toBe("Open editor");
  } finally {
    fixture.activeId = "same-row";
    fixture.params = {};
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("makes a linked project (or All projects) the shared selection instead of a page-private scope", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const surface = document.createElement("div");
  const root = createRoot(surface);
  const render = (params: Record<string, string>) => act(async () => {
    fixture.params = { section: "tasks", machineId: "same-row", ...params };
    root.render(h(ManagementRoute));
  });
  const project = () => surface.querySelector("button")?.dataset.project;
  try {
    await render({});
    expect(project()).toBe("workspace-project");
    expect(fixture.selectProject).not.toHaveBeenCalled();
    await render({ projectFilter: "project", projectId: "chosen-project" });
    expect(fixture.selectProject).toHaveBeenLastCalledWith("chosen-project");
    await render({ projectFilter: "project", projectId: "chosen-project" });
    expect(project()).toBe("chosen-project");
    await render({ projectFilter: "all" });
    expect(fixture.selectProject).toHaveBeenLastCalledWith(null);
    await render({ projectFilter: "all" });
    expect(project()).toBe("all");
    // Another computer's link never changes this computer's selection.
    fixture.selectProject.mockClear();
    await render({ machineId: "other-computer", projectFilter: "project", projectId: "foreign" });
    expect(fixture.selectProject).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    fixture.params = {};
    fixture.selected = "workspace-project";
    fixture.selectProject.mockClear();
    vi.unstubAllGlobals();
  }
});

it.each(["tasks", "goals"] as const)("retires the %s draft only when the reviewed pairing changes", async (section) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const surface = document.createElement("div");
  const root = createRoot(surface);
  const render = () => act(async () => root.render(h(ManagementScreen, { section })));
  try {
    await render();
    await act(async () => surface.querySelector("button")!.click());
    await render();
    expect(surface.textContent).toBe("Private open draft");
    fixture.token = "new-pairing-same-row-id";
    await render();
    expect(surface.textContent).toBe("Open editor");
  } finally {
    await act(async () => root.unmount());
    fixture.token = "original-pairing";
    vi.unstubAllGlobals();
  }
});
