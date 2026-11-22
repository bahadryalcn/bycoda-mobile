// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Note } from "@/domain/types";
import type { SwipeRowAction } from "@/ui/swipe-actions";

const fixture = vi.hoisted(() => ({
  connection: { token: "computer-a", isCurrent: () => true },
  allowed: true,
  showToast: vi.fn(),
  clipboard: { copy: vi.fn(), inFlight: false, busy: false, copied: false, error: null as Error | null },
}));
vi.mock("@/ui/use-clipboard-feedback", () => ({ useClipboardFeedback: () => fixture.clipboard }));
vi.mock("lucide-react-native/icons/copy", () => ({ default: () => null }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => fixture.connection }));
vi.mock("@/ui/private-access", () => ({
  usePrivateContentAccess: () => ({ allowed: fixture.allowed, check: () => fixture.allowed }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/toast", () => ({ showToast: fixture.showToast }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("./note-summary-row", () => ({
  NoteSummaryRow: ({ trailing }: { trailing: PropsWithChildren["children"] }) => h("div", null, trailing),
}));
vi.mock("@/ui/swipe-actions", () => ({
  SwipeActions: ({ actions, children, disabled }: PropsWithChildren<{ actions: SwipeRowAction[]; disabled: boolean }>) =>
    h("div", null, children, ...actions.map((action) =>
      h("button", { key: action.key, "data-action": action.key === "delete" ? "swipe" : `swipe-${action.key}`, disabled, onClick: action.onPress }, action.label))),
}));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: PropsWithChildren) => h("p", null, children),
  Stack: ({ children }: PropsWithChildren) => h("div", null, children),
  Sheet: ({ title, children }: PropsWithChildren<{ title: string }>) => h("section", { "aria-label": title }, children),
  FormActions: ({ submitLabel, onSubmit }: { submitLabel: string; onSubmit: () => void }) =>
    h("button", { "data-action": "confirm", onClick: onSubmit }, submitLabel),
  ActionMenu: ({ actions }: { actions: SwipeRowAction[] }) =>
    h("div", null, ...actions.map((action) =>
      h("button", { key: action.key, "data-action": action.key === "delete" ? "menu" : `menu-${action.key}`, disabled: action.disabled, onClick: action.onPress }, action.label))),
}));

import { NoteLibraryRow } from "./note-library-row";

const note: Note = {
  id: "note-1", slug: "sketch", title: "Sketch", body: "saved content", tags: [], createdAt: 1, updatedAt: 2,
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.connection = { token: "computer-a", isCurrent: () => true };
  fixture.allowed = true;
  fixture.showToast.mockClear();
  fixture.clipboard = { copy: vi.fn(), inFlight: false, busy: false, copied: false, error: null };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function row() {
  const onDelete = vi.fn();
  const onOpen = vi.fn();
  const render = (overrides: Partial<Parameters<typeof NoteLibraryRow>[0]> = {}) =>
    act(() => root.render(h(NoteLibraryRow, {
      note, machineName: "Studio", projectId: "project-a", busy: false, canDelete: true, onOpen, onDelete, ...overrides,
    })));
  const button = (action: string) => container.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  const click = (action: string) => act(() => button(action)!.click());
  render();
  return { render, onDelete, button, click };
}

it.each(["swipe", "menu"])("requires explicit confirmation after selecting delete through %s", (action) => {
  const { onDelete, button, click } = row();
  click(action);
  expect(onDelete).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Sketch · Studio");
  const confirm = button("confirm")!;
  act(() => { confirm.click(); confirm.click(); });
  expect(onDelete).toHaveBeenCalledExactlyOnceWith("note-1", 2);
});

it.each(["swipe-copy", "menu-copy"])("copies the note through %s and reports the result", (action) => {
  const { render, click } = row();
  click(action);
  expect(fixture.clipboard.copy).toHaveBeenCalledOnce();
  fixture.clipboard = { ...fixture.clipboard, copied: true };
  render();
  expect(fixture.showToast).toHaveBeenCalledExactlyOnceWith({ message: "Copied" });
});

it("offers copy without delete on a computer that cannot delete notes", () => {
  const { button } = row();
  act(() => root.render(h(NoteLibraryRow, {
    note, machineName: "Studio", projectId: "project-a", busy: false, canDelete: false, onOpen: vi.fn(), onDelete: vi.fn(),
  })));
  expect(button("menu-copy")).not.toBeNull();
  expect(button("menu")).toBeNull();
});

it("rejects confirmation after its reviewed revision changes", () => {
  const { render, onDelete, click } = row();
  click("swipe");
  render({ note: { ...note, updatedAt: 3 } });
  click("confirm");
  expect(onDelete).not.toHaveBeenCalled();
  expect(fixture.showToast).toHaveBeenCalledOnce();
});

it("retires the confirmation and disables both entry points when private access is lost", () => {
  const { render, onDelete, button, click } = row();
  click("menu");
  fixture.allowed = false;
  render();
  expect(button("confirm")).toBeNull();
  expect(button("menu")).toBeNull();
  expect(button("swipe")?.disabled).toBe(true);
  expect(onDelete).not.toHaveBeenCalled();
});
