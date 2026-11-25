// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMachines } from "@/state/machines";
import { ProjectScreen } from "./project-screen";
import { DraftWriteError } from "./draft-store";
import type { DraftGuard } from "./file-editor-types";
vi.mock("@/ui/no-computer", () => ({ NoComputerState: () => null, NoComputerGate: () => null }));

const fixture = vi.hoisted(() => ({
  details: undefined as (() => void) | undefined,
  worktree: undefined as (() => void) | undefined,
  createWorktree: undefined as (() => void) | undefined,
  registerDraftGuard: undefined as ((guard: DraftGuard) => void) | undefined,
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock("expo-router", () => ({ router: { replace: vi.fn(), push: vi.fn() }, Stack: { Screen: () => null } }));
vi.mock("react-native", () => {
  const container = ({ children }: { children?: ReactNode }) => h("div", null, children);
  return { ScrollView: container, Text: container, View: container };
});
vi.mock("lucide-react-native/icons/ellipsis", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/archive", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/info", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/folder-tree", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/search", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/grid-2x2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/git-branch", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/git-pull-request", () => ({ default: () => null }));
vi.mock("@/state/machines", async () => {
  const { create } = await import("zustand");
  const useMachines = create(() => ({ machines: [] as (typeof firstComputer)[], activeId: "saved-computer" }));
  return { useMachines, useActiveMachine: () => useMachines((state) => state.machines[0]) };
});
vi.mock("@/state/project-directory-preferences", () => ({ rememberOpenedProject: vi.fn(async () => {}) }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => ({ data: { worktrees: [{ path: "/first/feature", branch: "feature" }] } }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/layout", () => ({ useScreenChrome: () => ({ nativeTitle: false }) }));
vi.mock("@/ui/screen-content-insets", () => ({ useScreenContentInsets: () => ({ left: 0, right: 0 }) }));
vi.mock("@/ui/machine-bar", () => ({ MachineConnectionStatus: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/ui/workspace-frame", () => ({
  WorkspaceFrame: ({ toolbar, feedback, children }: { toolbar: ReactNode; feedback?: ReactNode; children?: ReactNode }) =>
    h("main", null, toolbar, feedback, children),
}));
vi.mock("@/ui/private-content", () => ({
  PrivateContentAccessProvider: ({ children }: { children?: ReactNode }) => children,
  PrivateContentBoundary: ({ visible, children }: { visible: boolean; children?: ReactNode }) => visible ? children : null,
}));
vi.mock("@/ui/primitives", () => {
  const Button = ({ label, onPress }: { label: string; onPress: () => void }) => {
    if (label === "Create worktree") fixture.createWorktree = onPress;
    if (label.endsWith(". Project details")) fixture.details = onPress;
    return h("button", { onClick: onPress }, label);
  };
  return {
    Button, IconButton: Button, PressableCard: Button,
    HeaderBackButton: () => null, stackBackOptions: () => ({}),
    Screen: ({ children }: { children: ReactNode }) => h("div", null, children),
    ScreenHeading: ({ context, actions }: { context: ReactNode; actions: ReactNode }) => h("header", null, context, actions),
    Sheet: ({ visible, title, children, onClose }: { visible: boolean; title: string; children: ReactNode; onClose: () => void }) =>
      visible ? h("section", { "aria-label": title }, children,
        h("button", { onClick: onClose }, `Close ${title}`)) : null,
    SelectField: ({ options, onChange }: { options: { label: string; value: string }[]; onChange: (value: string) => void }) =>
      options.map(({ label, value }) => h("button", { key: value, onClick: () => onChange(value) }, label)),
    StateView: () => null, QueryState: () => null, SearchField: () => null,
    MutationState: ({ mutation }: { mutation: { error: Error | null } }) =>
      mutation.error ? h("p", { "data-mutation-error": true }, mutation.error.message) : null,
    Notice: ({ message, onRetry }: { message: string; onRetry: () => void }) =>
      h("div", null, message, h("button", { onClick: onRetry }, "Retry")),
  };
});
vi.mock("./project-directory-feedback", () => ({ ProjectDirectoryFeedback: () => null }));
vi.mock("./use-project-directory", async () => {
  const { useActiveMachine } = await import("@/state/machines");
  return { useProjectList: () => {
    const machine = useActiveMachine();
    return {
      data: machine ? [{ id: "project", name: machine.name, cwd: `/${machine.environmentId}` }] : [],
      isProjectVisible: () => true,
    };
  } };
});
vi.mock("./files-panel", () => ({
  ProjectFiles: ({ cwd, root, initialPath, onDraftGuard, hideDraftWriteWarning }: { cwd?: string; root?: string; initialPath?: string; onDraftGuard: (guard: DraftGuard) => void; hideDraftWriteWarning?: boolean }) => {
    fixture.registerDraftGuard = onDraftGuard;
    return h("p", { "data-files-root": true, "data-initial-path": initialPath, "data-draft-warning-hidden": hideDraftWriteWarning ?? false }, cwd ?? root);
  },
}));
vi.mock("./git-panel", () => ({
  ProjectGit: ({ cwd, root, onOpenFile }: { cwd?: string; root?: string; onOpenFile: (path: string) => void }) =>
    h("div", null, h("p", { "data-git-root": true }, cwd ?? root),
      h("button", { onClick: () => onOpenFile("src/changed.ts") }, "Inspect changed file")),
}));
vi.mock("./sessions-panel", () => ({ ProjectSessions: () => null }));
vi.mock("../management/tool-directory", () => ({ ToolDirectory: () => null }));
vi.mock("./submodule-view", () => ({ SubmoduleView: () => null }));
vi.mock("./project-segments", () => ({ ProjectSegments: () => null }));
vi.mock("./worktree-create", () => ({
  WorktreeCreate: ({ visible }: { visible: boolean }) => visible ? h("section", { "aria-label": "Create worktree" }) : null,
}));
vi.mock("./project-details-sheet", () => ({
  ProjectDetailsSheet: ({ visible, project }: { visible: boolean; project: { cwd: string } }) =>
    visible ? h("section", { "aria-label": "Project details" }, project.cwd) : null,
}));
vi.mock("./project-menu-sheet", () => ({
  ProjectMenuSheet: ({ visible, sections, onClose }: {
    visible: boolean;
    sections: { items: (false | { key: string; label: string; onPress: () => void })[] }[];
    onClose: () => void;
  }) => visible ? h("section", { "aria-label": "Project options" }, sections.flatMap(({ items }) => items.map((item) => {
    if (!item) return null;
    if (item.key === "worktree") fixture.worktree = item.onPress;
    return h("button", { key: item.key, onClick: () => { onClose(); item.onPress(); } }, item.label);
  }))) : null,
}));

const firstComputer = {
  id: "saved-computer", name: "First project", endpoint: "https://first.test", environmentId: "first", lanKey: "first-key",
  capabilities: ["git.worktreeCreate"],
};
const secondComputer = {
  ...firstComputer, name: "Second project", endpoint: "https://second.test", environmentId: "second", lanKey: "second-key",
};

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const setComputer = (computer: typeof firstComputer) => useMachines.setState({
  machines: [computer] as ReturnType<typeof useMachines.getState>["machines"],
});
const click = async (label: string) => {
  const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
  expect(button, label).toBeDefined();
  await act(async () => button?.click());
};
const overlay = (name: string) => container.querySelector(`section[aria-label="${name}"]`);

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.details = undefined;
  fixture.worktree = undefined;
  fixture.createWorktree = undefined;
  setComputer(firstComputer);
  container = document.createElement("div");
  root = createRoot(container);
  const queryClient = new QueryClient();
  await act(async () => root.render(h(QueryClientProvider, { client: queryClient },
    h(ProjectScreen, { id: "project", initialSegment: "files" }))));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("keeps project details on refresh and closes them after same-row re-pairing", async () => {
  await click("First project. Project details");
  expect(overlay("Project details")?.textContent).toBe("/first");
  const oldDetails = fixture.details!;
  await act(async () => setComputer({ ...firstComputer }));
  expect(overlay("Project details")?.textContent).toBe("/first");

  await act(async () => setComputer(secondComputer));
  expect(overlay("Project details")).toBeNull();
  await act(async () => oldDetails());
  expect(overlay("Project details")).toBeNull();
  await click("Second project. Project details");
  expect(overlay("Project details")?.textContent).toBe("/second");
});

it("retires worktree actions from the previous pairing and allows fresh selection", async () => {
  await click("Project options");
  const oldWorktree = fixture.worktree!;
  await click("Main project folder");
  expect(overlay("Working folder")).not.toBeNull();
  const oldCreate = fixture.createWorktree!;
  await act(async () => setComputer(secondComputer));
  expect(overlay("Working folder")).toBeNull();
  await act(async () => { oldWorktree(); oldCreate(); });
  expect(overlay("Working folder")).toBeNull();
  expect(overlay("Create worktree")).toBeNull();

  await click("Project options");
  await click("Main project folder");
  await click("Create worktree");
  expect(overlay("Create worktree")).not.toBeNull();
});

it("keeps the current details open if an old worktree action fires after changing folders", async () => {
  await click("Project options");
  const openOldWorktree = fixture.worktree!;
  await click("Main project folder");
  await click("feature");
  await click("First project. Project details");
  expect(overlay("Project details")?.textContent).toBe("/first/feature");
  await act(async () => openOldWorktree());
  expect(overlay("Project details")?.textContent).toBe("/first/feature");
});

it("retries the same folder choice after the current draft fails to save", async () => {
  const guard = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new DraftWriteError(new Error("QA native draft write blocked")))
    .mockResolvedValue(undefined);
  fixture.registerDraftGuard!(guard);
  await click("Project options");
  await click("Main project folder");
  await click("feature");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(container.querySelector("[data-files-root]")?.textContent).toBe("/first");
  expect(overlay("Working folder")?.textContent).toContain("Couldn’t save the draft. Your edits are still open.");
  expect(overlay("Working folder")?.textContent).not.toContain("QA native draft write blocked");
  await click("Retry");
  expect(container.querySelector("[data-files-root]")?.textContent).toBe("/first/feature");
  expect(overlay("Working folder")).toBeNull();
  expect(guard).toHaveBeenCalledTimes(2);
});

it("hides the editor's draft warning while either working-folder sheet is open", async () => {
  const editor = container.querySelector("[data-files-root]")!;
  expect(editor.getAttribute("data-draft-warning-hidden")).toBe("false");
  await click("Project options");
  await click("Main project folder");
  expect(editor.getAttribute("data-draft-warning-hidden")).toBe("true");
  await click("Close Working folder");
  expect(editor.getAttribute("data-draft-warning-hidden")).toBe("false");
  await click("Project options");
  await click("Main project folder");
  await click("Create worktree");
  expect(overlay("Create worktree")).not.toBeNull();
  expect(editor.getAttribute("data-draft-warning-hidden")).toBe("true");
});

it("does not surface an abandoned folder-switch error after dismissing the picker", async () => {
  const guard = vi.fn<() => Promise<void>>().mockRejectedValue(new DraftWriteError(new Error("Storage unavailable")));
  fixture.registerDraftGuard!(guard);
  await click("Project options");
  await click("Main project folder");
  await click("feature");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(overlay("Working folder")?.textContent).toContain("Couldn’t save the draft");
  await click("Close Working folder");
  expect(container.querySelector("[data-mutation-error]")).toBeNull();
  await click("Project options");
  await click("Project tools");
  expect(overlay("Project tools")?.querySelector("[data-mutation-error]")).toBeNull();
});

it("returns Files to the main folder when the same computer is re-paired", async () => {
  await click("Project options");
  await click("Main project folder");
  await click("feature");
  expect(container.querySelector("[data-files-root]")?.textContent).toBe("/first/feature");

  await act(async () => setComputer({ ...firstComputer, endpoint: "https://repaired.test", lanKey: "new-key" }));
  expect(container.querySelector("[data-files-root]")?.textContent).toBe("/first");
});

it("retires a Changes file preview and the old linked worktree before reading the new connection", async () => {
  await act(async () => root.render(null));
  const queryClient = new QueryClient();
  await act(async () => root.render(h(QueryClientProvider, { client: queryClient },
    h(ProjectScreen, { id: "project", initialSegment: "git", initialCwd: "/first/feature" }))));
  expect(container.querySelector("[data-git-root]")?.textContent).toBe("/first/feature");
  await click("Inspect changed file");
  expect(container.querySelector("[data-files-root]")?.getAttribute("data-initial-path")).toBe("src/changed.ts");

  await act(async () => setComputer({ ...firstComputer, endpoint: "https://repaired.test", lanKey: "new-key" }));
  expect(container.querySelector("[data-files-root]")).toBeNull();
  expect(container.querySelector("[data-git-root]")?.textContent).toBe("/first");
});
