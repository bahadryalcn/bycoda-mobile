// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMachines } from "@/state/machines";
import { useLaunchRequest, type LaunchRequest } from "../sharing/model/launch-request";
import { NewSessionSheet } from "./new-session-sheet";

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  appendToDraft: vi.fn(),
  remember: vi.fn(async () => {}),
  selectProject: vi.fn(),
  create: vi.fn<(created: (id: string) => void) => Promise<boolean>>(),
  recover: undefined as ((receipt: { sessionId: string }) => void) | undefined,
  dismiss: undefined as (() => void) | undefined,
  command: { isPending: false, error: undefined as Error | undefined, reset: vi.fn() },
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock("expo-router", () => ({ router: { navigate: fixture.navigate, push: vi.fn() } }));
vi.mock("react-native", () => ({ View: ({ children }: { children: ReactNode }) => h("div", null, children) }));
vi.mock("@/state/machines", async () => {
  const { create } = await import("zustand");
  const useMachines = create(() => ({
    activeId: "computer", machines: [] as (typeof firstComputer)[], selectProject: fixture.selectProject,
  }));
  return { useMachines, useActiveMachine: () => useMachines((state) => state.machines[0]) };
});
vi.mock("@/state/project-directory-preferences", () => ({
  rememberOpenedProject: fixture.remember, useProjectDirectoryPreferences: () => ({ preferences: { recent: {} } }),
}));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("lucide-react-native/icons/mic", () => ({ default: () => null }));
vi.mock("@/ui/primitives", () => {
  const Action = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
    h("button", { onClick: onPress, disabled }, label);
  return {
    Body: ({ children }: { children: ReactNode }) => h("p", null, children),
    Button: Action,
    IconButton: Action,
    NavigationRow: Action,
    SearchField: () => null,
    Sheet: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => h("section", null, children, footer),
    ScreenList: ({ data, renderItem, ListHeaderComponent }: {
      data: { id: string }[];
      renderItem: (entry: { item: { id: string } }) => ReactNode;
      ListHeaderComponent?: ReactNode;
    }) => h("div", null, ListHeaderComponent, data.map((item) => h("div", { key: item.id }, renderItem({ item })))),
  };
});
vi.mock("@/ui/layout", () => ({ ScreenChromeProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/ui/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("./draft-append", () => ({ appendToDraft: fixture.appendToDraft }));
vi.mock("./project-directory-feedback", () => ({ ProjectDirectorySlot: () => null }));
vi.mock("../navigation-prefs/app-preferences", () => ({
  useAppPreferences: () => ({ preferences: { newSessionUsesLastProject: false } }),
}));
vi.mock("./shared", () => ({
  CommandError: ({ onRecovered, onDismiss }: { onRecovered: typeof fixture.recover; onDismiss: typeof fixture.dismiss }) => {
    fixture.recover = onRecovered;
    fixture.dismiss = onDismiss;
    return null;
  },
  relativeTime: () => "",
}));
vi.mock("./use-create-session", () => ({
  useCreateSession: () => ({
    catalog: {}, command: fixture.command, canStart: true, create: fixture.create, choices: [],
    locked: fixture.command.isPending || fixture.command.error?.name === "UncertainCommand",
    selection: { selectedProvider: "codex", selectedModel: "test-model" },
  }),
}));
vi.mock("./use-project-activity", async () => {
  const { useActiveMachine } = await import("@/state/machines");
  return { useProjectActivity: () => {
    const machine = useActiveMachine();
    const project = machine?.environmentId === "first" ? firstProject : secondProject;
    return { projects: { data: [project], isProjectVisible: () => true }, directoryReady: true, directory: [] };
  } };
});

const firstComputer = { id: "computer", endpoint: "https://first.test", environmentId: "first", lanKey: "first-key" };
const secondComputer = { ...firstComputer, endpoint: "https://second.test", environmentId: "second", lanKey: "second-key" };
const firstProject = { id: "shared-project", name: "First project", cwd: "/first" };
const secondProject = { ...firstProject, name: "Second project", cwd: "/second" };
const firstShare = {
  text: "First shared note", project: firstProject.id, files: [{ uri: "file:///first.txt", name: "first.txt" }],
};
const queuedLaunch = () => useLaunchRequest.getState().request;
const queueLaunch = (request: LaunchRequest) => useLaunchRequest.getState().queue(request);
const setComputer = (machine: typeof firstComputer) => useMachines.setState({
  machines: [machine] as ReturnType<typeof useMachines.getState>["machines"],
});

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const onClose = vi.fn();
const render = () => root.render(h(NewSessionSheet, { visible: true, onClose }));
const button = (label: string) => [...container.querySelectorAll("button")].find((node) => node.textContent === label);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  fixture.create.mockReset().mockImplementation(() => new Promise<boolean>(() => {}));
  fixture.recover = undefined;
  fixture.dismiss = undefined;
  fixture.command.error = undefined;
  fixture.command.isPending = false;
  useLaunchRequest.getState().clear();
  setComputer(firstComputer);
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it.each([
  [[], "The text will be added to the draft."],
  [firstShare.files, "Shared content will be added to the draft (1 file)."],
  [[...firstShare.files, { uri: "file:///second.txt", name: "second.txt" }], "Shared content will be added to the draft (2 files)."],
])("describes the pending draft for %j", async (files, message) => {
  queueLaunch({ ...firstShare, files });
  await act(async () => render());
  expect(container.textContent).toContain(message);
  expect(fixture.appendToDraft).not.toHaveBeenCalled();
});

it("retires the selected footer and ignores the previous computer's captured recovery", async () => {
  queueLaunch(firstShare);
  await act(async () => render());
  await act(async () => button("Start session")!.click());
  const oldSuccess = fixture.create.mock.calls[0][0];
  await act(async () => {
    fixture.command.error = Object.assign(new Error("Connection lost while starting"), { name: "UncertainCommand" });
    render();
  });
  const oldRecovery = fixture.recover!;

  await act(async () => {
    fixture.command.error = undefined;
    setComputer(secondComputer);
  });
  expect(button("Start session")).toBeUndefined();

  await act(async () => {
    oldRecovery({ sessionId: "old-session" });
    oldSuccess("old-session");
  });
  expect(fixture.navigate).not.toHaveBeenCalled();
  expect(fixture.appendToDraft).not.toHaveBeenCalled();
  expect(queuedLaunch()).toEqual(firstShare);

  await act(async () => button("Second project")!.click());
  expect(button("Start session")).toBeDefined();
});

it("leaves a newer share pending when a known receipt arrives for the started session", async () => {
  queueLaunch(firstShare);
  await act(async () => render());
  await act(async () => button("Start session")!.click());
  const finish = fixture.create.mock.calls[0][0];
  const next = { text: "Newer shared note", files: [{ uri: "file:///next.txt", name: "next.txt" }] };
  await act(async () => queueLaunch(next));
  const merged = queuedLaunch();

  await act(async () => finish("new-session"));
  expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith({ pathname: "/session/[id]", params: {
    id: "new-session", projectId: firstProject.id, machineId: firstComputer.id,
  } });
  expect(onClose).toHaveBeenCalledOnce();
  expect(fixture.appendToDraft).not.toHaveBeenCalled();
  expect(queuedLaunch()).toBe(merged);
  expect(merged?.text).toContain(next.text);
});

it("appends an unchanged share to the confirmed session draft only after an explicit start", async () => {
  queueLaunch(firstShare);
  await act(async () => render());
  expect(fixture.create).not.toHaveBeenCalled();
  expect(fixture.appendToDraft).not.toHaveBeenCalled();

  await act(async () => button("Start session")!.click());
  expect(fixture.appendToDraft).not.toHaveBeenCalled();
  await act(async () => fixture.create.mock.calls[0][0]("new-session"));
  expect(fixture.appendToDraft.mock.calls).toEqual([
    [{ machineId: firstComputer.id, sessionId: "new-session" }, { text: firstShare.text }],
    [{ machineId: firstComputer.id, sessionId: "new-session" }, { file: firstShare.files[0] }],
  ]);
  expect(queuedLaunch()).toBeNull();
});

it("keeps a dismissed recovery from claiming a later start on the same project", async () => {
  fixture.create.mockResolvedValueOnce(false);
  queueLaunch(firstShare);
  await act(async () => render());
  await act(async () => button("Start session")!.click());
  await act(async () => {
    fixture.command.error = Object.assign(new Error("Connection lost while starting"), { name: "UncertainCommand" });
    render();
  });
  const oldRecovery = fixture.recover!;
  await act(async () => {
    fixture.dismiss!();
    fixture.command.error = undefined;
    queueLaunch({ text: "Newer shared note", files: [] });
    render();
  });
  await act(async () => button("Start session")!.click());
  expect(fixture.create).toHaveBeenCalledTimes(2);
  await act(async () => oldRecovery({ sessionId: "old-session" }));
  expect(fixture.navigate).not.toHaveBeenCalled();
  expect(fixture.appendToDraft).not.toHaveBeenCalled();
  expect(queuedLaunch()?.text).toContain("Newer shared note");
  await act(async () => fixture.create.mock.calls[1][0]("new-session"));
  expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith({ pathname: "/session/[id]", params: {
    id: "new-session", projectId: firstProject.id, machineId: firstComputer.id,
  } });
  expect(queuedLaunch()).toBeNull();
});
