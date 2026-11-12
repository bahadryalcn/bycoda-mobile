// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { NoteEditor } from "./note-editor";
import type { NoteEditorProps } from "./types";

const fixture = vi.hoisted(() => ({
  fields: new Map<string, { error?: string; onChangeText: (value: string) => void }>(),
  mode: undefined as undefined | ((value: "edit" | "preview") => void),
  actions: undefined as undefined | { disabled: boolean; onSubmit: () => void },
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: { error: {}, caption: {} } }) }));
vi.mock("@/ui/styles", () => ({ uiStyles: { error: {}, caption: {} } }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: vi.fn() }) }));
vi.mock("@/ui/message-text", () => ({ MessageText: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/state/queries", () => ({ useHostQuery: vi.fn() }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Stack: wrapper, Section: wrapper, Card: wrapper, Row: wrapper, Heading: wrapper,
    Body: ({ children, accessibilityRole }: PropsWithChildren<{ accessibilityRole?: string }>) => createElement("div", { role: accessibilityRole }, children),
    Field: (props: { label: string; error?: string; onChangeText: (value: string) => void }) => { fixture.fields.set(props.label, props); return null; },
    SegmentedControl: ({ onChange }: { onChange: typeof fixture.mode }) => { fixture.mode = onChange; return null; },
    FormActions: (props: NonNullable<typeof fixture.actions>) => { fixture.actions = props; return null; },
    ActionMenu: () => null, Button: () => null, QueryState: () => null, MutationState: () => null,
  };
});

let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  await act(async () => root?.unmount());
  fixture.fields.clear();
  vi.unstubAllGlobals();
});

it("associates validation with its field, keeps preview alerts, and only saves corrected values", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  const save = vi.fn();
  const store = vi.fn();
  const initial = { id: "note", title: "x".repeat(201), body: "Preview", tags: "x".repeat(49), expectedUpdatedAt: 7 };
  await act(async () => root.render(createElement(NoteEditor, {
    initial, save: { mutate: save }, remove: {}, storage: { mutate: store }, onClose: vi.fn(),
  } as unknown as NoteEditorProps)));
  expect(fixture.fields.get("Title")?.error).toContain("200 characters");
  expect(fixture.fields.get("Tags")?.error).toContain("48 characters");
  expect(fixture.fields.get("Note (Markdown)")?.error).toBeUndefined();
  expect(fixture.actions?.disabled).toBe(true);
  act(() => fixture.actions?.onSubmit());
  expect(save).not.toHaveBeenCalled();

  act(() => fixture.mode?.("preview"));
  expect(container.querySelectorAll('[role="alert"]')).toHaveLength(2);
  act(() => fixture.mode?.("edit"));
  act(() => fixture.fields.get("Title")?.onChangeText("Fixed title"));
  act(() => fixture.fields.get("Tags")?.onChangeText("design"));
  expect(fixture.fields.get("Title")?.error).toBeUndefined();
  expect(fixture.fields.get("Tags")?.error).toBeUndefined();
  expect(fixture.actions?.disabled).toBe(false);
  act(() => fixture.actions?.onSubmit());
  expect(save.mock.calls[0][0]).toMatchObject({ note: { title: "Fixed title", body: "Preview", tags: ["design"] }, expectedUpdatedAt: 7 });
  expect(store).toHaveBeenCalledTimes(2);
});
