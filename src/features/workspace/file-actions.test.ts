// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { FileActions } from "./file-actions";
const state = vi.hoisted(() => ({
  actions: [] as { key: string; onPress: () => void }[],
  submit: undefined as undefined | (() => void),
  size: "",
  mutate: vi.fn(async () => undefined),
}));
vi.mock("lucide-react-native/icons/pencil", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/copy", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/folder-input", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    createElement("div", null, children),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string) => en,
}));
vi.mock("./shared", () => ({
  workspaceStyles: {},
  useProjectRefresh: () => vi.fn(),
}));
vi.mock("@/ui/overflow-menu", () => ({
  ActionList: ({ actions }: { actions: typeof state.actions }) => {
    state.actions = actions;
    return null;
  },
}));
vi.mock("@/ui/primitives", () => ({
  Sheet: ({ children, size }: PropsWithChildren<{ size: string }>) => {
    state.size = size;
    return createElement("div", null, children);
  },
  Body: ({
    children,
    numberOfLines,
  }: PropsWithChildren<{ numberOfLines?: number }>) =>
    createElement("span", { "data-lines": numberOfLines }, children),
  IdentifierField: () => null,
  ErrorNotice: () => null,
  FormActions: ({ onSubmit }: { onSubmit: () => void }) => {
    state.submit = onSubmit;
    return null;
  },
}));
it("opens deletion as its own step from the action list; only explicit submit dispatches", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const close = vi.fn(),
    completed = vi.fn();
  const props = {
    root: "/host/project/with/a/long/target/path",
    projectId: "project",
    entry: { name: "file.ts", path: "nested/file.ts", isDir: false, ignored: false },
    action: { isPending: false, error: null, mutateAsync: state.mutate },
    onClose: close,
    onCompleted: completed,
  } as Parameters<typeof FileActions>[0];
  try {
    await act(async () => root.render(createElement(FileActions, props)));
    expect(state.size).toBe("compact");
    expect(state.actions.map((action) => action.key)).toEqual(["rename", "copy", "move", "delete"]);
    await act(async () => state.actions.find((action) => action.key === "delete")!.onPress());
    expect(state.size).toBe("compact");
    expect(container.textContent).toContain("/host/project/with/a/long/target/path/nested/file.ts");
    expect(container.querySelector("[data-lines]")).toBeNull();
    expect(state.mutate).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    await act(async () => state.submit!());
    expect(state.mutate).toHaveBeenCalledExactlyOnceWith({
      command: "delete_path",
      args: { path: "/host/project/with/a/long/target/path/nested/file.ts" },
    });
    expect(completed).toHaveBeenCalledExactlyOnceWith("Deleted {p0}.");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
