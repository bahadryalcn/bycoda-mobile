// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { NoteEditor } from "./note-editor";
import type { NoteEditorProps } from "./types";

type HeaderProps = {
  status: { label: string; danger?: boolean } | null;
  mode: "edit" | "read";
  canDelete: boolean;
  handlers: { current: { toggle: () => void; close: () => void; remove: () => void } };
};
const fixture = vi.hoisted(() => ({
  title: undefined as undefined | { error?: string; onChangeText: (value: string) => void; onBlur: () => void; onFocus: () => void },
  body: undefined as undefined | { onChangeText: (value: string) => void; value: string },
  tags: undefined as undefined | { onChange?: (tags: string[]) => void; editable?: boolean },
  errors: [] as string[],
  confirm: vi.fn(),
  requestClose: vi.fn(),
  guard: undefined as undefined | { dirty?: boolean; pending?: boolean },
}));
const { div } = vi.hoisted(() => ({ div: ({ children }: { children?: unknown }) => children as never }));
vi.mock("react-native", () => ({ Keyboard: { dismiss: vi.fn() }, ScrollView: div, View: div }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "computer", name: "Computer" }) }));
vi.mock("../shared/format", () => ({ identifier: () => "copy-id" }));
// The editor confirms through the shared reviewed-record sheet; its approval is the fourth argument.
vi.mock("../shared/use-record-confirmation", () => ({
  useRecordConfirmation: () => ({ confirm: fixture.confirm, review: null }),
  RecordConfirmationSheet: () => null,
}));
vi.mock("react-native-keyboard-controller", () => ({ useKeyboardState: (select: (state: { isVisible: boolean }) => boolean) => select({ isVisible: true }) }));
vi.mock("lucide-react-native/icons/copy", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/eye", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pencil", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, uiStyles: { caption: {}, pageTitle: {} } }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, unknown>) => en.replace("{p0}", String(values?.p0 ?? "")) }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: (guard: typeof fixture.guard) => { fixture.guard = guard; return { requestClose: fixture.requestClose }; } }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => createElement("article", null, text) }));
vi.mock("@/ui/confirm", () => ({ confirmAction: fixture.confirm }));
vi.mock("@/ui/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/ui/use-clipboard-feedback", () => ({ useClipboardFeedback: () => ({ copy: vi.fn(), copied: false, error: null, inFlight: false }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: vi.fn() }));
vi.mock("@/state/app-state", () => ({ AppState: { addEventListener: () => ({ remove: vi.fn() }) } }));
vi.mock("../shared/record-bits", () => ({ useRelativeTime: () => () => "now", joinMeta: (parts: unknown[]) => parts.filter(Boolean).join(" · ") }));
vi.mock("@/ui/markdown-editor", () => ({
  DocumentTitleInput: (props: NonNullable<typeof fixture.title>) => { fixture.title = props; return null; },
  MarkdownTextEditor: (props: NonNullable<typeof fixture.body>) => { fixture.body = props; return null; },
  MarkdownFormatBar: () => null,
}));
vi.mock("@/ui/tag-chips-field", () => ({ TagChipsField: (props: NonNullable<typeof fixture.tags>) => { fixture.tags = props; return null; } }));
vi.mock("@/ui/primitives", () => ({
  ActionMenu: () => null, Button: () => null, Card: div, Notice: () => null, Row: div, PressableArea: div, ErrorNotice: () => null, IconButton: () => null, QueryState: () => null,
  Body: ({ children }: PropsWithChildren) => createElement("p", null, children),
  Heading: ({ children }: PropsWithChildren) => createElement("h1", null, children),
  FieldError: ({ message }: { message: string }) => { fixture.errors.push(message); return null; },
}));

let root: ReturnType<typeof createRoot> | undefined;
let header: ReactElement<HeaderProps> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  header = undefined;
  Object.assign(fixture, { title: undefined, body: undefined, tags: undefined, errors: [], guard: undefined });
  fixture.confirm.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function open(initial: NoteEditorProps["initial"], extra: Partial<NoteEditorProps> = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const container = document.createElement("div");
  root = createRoot(container);
  const save = { mutateAsync: vi.fn(async () => ({ updatedAt: 20 })) };
  const remove = { mutate: vi.fn(), isPending: false };
  const owner = { save: vi.fn(async () => {}), clearSaved: vi.fn(async () => {}) };
  const props = {
    initial, save, remove, draftOwner: owner, onClose: vi.fn(),
    setHeader: (node: ReactNode) => { header = (node ?? undefined) as typeof header; },
    ...extra,
  } as unknown as NoteEditorProps;
  await act(async () => root!.render(createElement(NoteEditor, props)));
  return { container, save, remove, owner };
}

it("opens a written note for reading and switches to editing from the header toggle", async () => {
  const { container } = await open({ id: "n", title: "Plan", body: "# Hello", tags: "a", expectedUpdatedAt: 7 });
  expect(header?.props.mode).toBe("read");
  expect(container.querySelector("article")?.textContent).toBe("# Hello");
  expect(fixture.body).toBeUndefined();
  act(() => header!.props.handlers.current.toggle());
  expect(header?.props.mode).toBe("edit");
  expect(fixture.body?.value).toBe("# Hello");
});

it("saves edits automatically with the latest conflict base and keeps a phone draft", async () => {
  const { save, owner } = await open({ id: "n", title: "Plan", body: "", tags: "", expectedUpdatedAt: 7 });
  expect(header?.props.mode).toBe("edit");
  act(() => fixture.body!.onChangeText("First line"));
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(owner.save).toHaveBeenCalledWith(expect.objectContaining({ body: "First line" }));
  expect(header?.props.status?.label).toBe("Saving…");
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(save.mutateAsync).toHaveBeenCalledWith({ note: { id: "n", title: "Plan", body: "First line", tags: [] }, expectedUpdatedAt: 7 });
  expect(header?.props.status?.label).toBe("Saved");
  act(() => fixture.body!.onChangeText("First line\nmore"));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(save.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ expectedUpdatedAt: 20 }));
});

it("keeps invalid titles and tags off the computer and asks before closing", async () => {
  const { save } = await open({ id: "n", title: "Plan", body: "", tags: "", expectedUpdatedAt: 7 });
  act(() => fixture.title!.onChangeText("x".repeat(201)));
  act(() => fixture.tags!.onChange!(["y".repeat(49)]));
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(save.mutateAsync).not.toHaveBeenCalled();
  expect(fixture.title?.error).toContain("200 characters");
  expect(fixture.errors.some((message) => message.includes("48 characters"))).toBe(true);
  expect(header?.props.status).toEqual({ label: "Not saved", danger: true });
  expect(fixture.guard?.dirty).toBe(true);
});

it("waits for a new note's title before creating it, then finalizes that title", async () => {
  const { save } = await open({ id: "new", title: "", body: "", tags: "", expectedUpdatedAt: 0 }, { unsaved: true });
  act(() => fixture.title!.onFocus());
  act(() => fixture.title!.onChangeText("Mee"));
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(save.mutateAsync).not.toHaveBeenCalled();
  act(() => fixture.title!.onChangeText("Meeting"));
  act(() => fixture.title!.onBlur());
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(save.mutateAsync).toHaveBeenCalledWith({
    note: { id: "new", title: "Meeting", body: "", tags: [], finalizeSlug: true },
    expectedUpdatedAt: 0,
  });
  expect(header?.props.canDelete).toBe(true);
});

it("deletes from the header menu after confirmation with the newest revision", async () => {
  const { remove } = await open({ id: "n", title: "Plan", body: "Body", tags: "", expectedUpdatedAt: 7 });
  act(() => header!.props.handlers.current.remove());
  expect(fixture.confirm).toHaveBeenCalledTimes(1);
  await act(async () => { fixture.confirm.mock.calls[0]![3](); });
  expect(remove.mutate).toHaveBeenCalledWith({ id: "n", expectedUpdatedAt: 7 }, expect.anything());
});
