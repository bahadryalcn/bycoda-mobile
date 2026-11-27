// @vitest-environment happy-dom
import { act, createElement, type CSSProperties, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ComposerAttachments } from "./composer-attachments";

const fixture = vi.hoisted(() => ({
  owns: vi.fn(() => true),
  exists: true,
}));
function wrapper({ children }: PropsWithChildren) {
  return createElement("div", null, children);
}
vi.mock("react-native", () => ({
  View: ({ children, style }: PropsWithChildren<{ style?: CSSProperties | CSSProperties[] }>) =>
    createElement("div", { style: Array.isArray(style) ? Object.assign({}, ...style) : style }, children),
}));
vi.mock("expo-image", () => ({ Image: () => null }));
vi.mock("expo-file-system", () => ({ File: class { get exists() { return fixture.exists; } size = 13; } }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/file", () => ({ default: () => null }));
vi.mock("panelui-native/components/attachment", () => ({
  Attachment: Object.assign(
    ({ onPress, accessibilityLabel, children }: PropsWithChildren<{ onPress(): void; accessibilityLabel: string }>) =>
      createElement("div", null, createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, "Open attachment"), children),
    {
      Media: wrapper, Content: wrapper, Title: wrapper, Description: wrapper, Actions: wrapper,
      Action: ({ accessibilityLabel, onPress }: { accessibilityLabel: string; onPress(): void }) =>
        createElement("button", { "aria-label": accessibilityLabel, onClick: onPress }),
    },
  ),
}));
vi.mock("panelui-native/components/chip", () => ({ Chip: wrapper }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: { p0: string }) => en.replace("{p0}", values?.p0 ?? "") }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/tokens", () => ({ metrics: {}, space: {} }));
vi.mock("@/ui/media-viewer", () => ({ MediaViewer: () => null }));
vi.mock("./attachment-files", () => ({ isScopedStagedFile: fixture.owns }));
vi.mock("@/ui/document-content", () => ({
  DocumentContent: ({ uri }: { uri: string }) => createElement("output", null, uri),
}));
vi.mock("@/ui/primitives", () => ({
  Body: wrapper, Button: wrapper, ErrorText: wrapper, StateView: ({ title }: { title: string }) => createElement("p", null, title),
  Sheet: ({ visible, onClose, children }: PropsWithChildren<{ visible: boolean; onClose(): void }>) =>
    visible ? createElement("section", null, children, createElement("button", { onClick: onClose }, "Close preview")) : null,
}));

const file = { id: "pdf", name: "notes.pdf", kind: "file" as const, size: 13, mimeType: "application/pdf", uri: "file:///draft/pdf" };
const onRemove = vi.fn();
let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const press = (label: string) => act(async () =>
  Array.from(container.querySelectorAll("button")).find(button => button.textContent === label)!.click());
const render = (files = [file], scope = "host:session", custody?: "composer" | "question") => act(async () =>
  root.render(createElement(ComposerAttachments, { files, scope, custody, transfers: {}, onRemove, onRetry: vi.fn(), disabled: false })));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.owns.mockReset().mockReturnValue(true);
  fixture.exists = true;
  onRemove.mockClear();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("opens the scoped PDF in the document reader and closes without changing the draft", async () => {
  await render();
  expect(container.querySelector("output")).toBeNull();
  await press("Open attachment");
  expect(fixture.owns).toHaveBeenCalledWith(file, "host:session", "composer");
  expect(container.querySelector("output")?.textContent).toBe(file.uri);
  await press("Close preview");
  expect(container.querySelector("output")).toBeNull();
  expect(container.textContent).toContain(file.name);
  expect(onRemove).not.toHaveBeenCalled();
});

it("keeps separate full-width rows and actions for two draft attachments", async () => {
  const second = { ...file, id: "second", name: "second.pdf", uri: "file:///draft/second" };
  await render([file, second]);
  const list = container.firstElementChild as HTMLElement;
  expect(list.style.flexDirection).toBe("column");
  expect(list.children).toHaveLength(2);
  const removeFirst = list.children[0]!.querySelector<HTMLButtonElement>('button[aria-label="Remove attachment: notes.pdf"]')!;
  const openSecond = list.children[1]!.querySelector<HTMLButtonElement>('button[aria-label="Open attachment: second.pdf"]')!;
  await act(async () => removeFirst.click());
  expect(onRemove).toHaveBeenCalledExactlyOnceWith(file);
  await act(async () => openSecond.click());
  expect(container.querySelector("output")?.textContent).toBe(second.uri);
});

it("retires the preview when the scope changes or its attachment is removed", async () => {
  await render();
  await press("Open attachment");
  await render([file], "host:other");
  expect(container.querySelector("section")).toBeNull();
  await render();
  expect(container.querySelector("section")).toBeNull();
  await press("Open attachment");
  await render([]);
  expect(container.querySelector("section")).toBeNull();
});

it("checks question attachments against their own staging directory", async () => {
  await render([file], "host:session", "question");
  await press("Open attachment");
  expect(fixture.owns).toHaveBeenCalledWith(file, "host:session", "question");
});

it.each(["foreign", "missing"])("keeps a %s draft file out of the reader", async state => {
  fixture.owns.mockReturnValue(state !== "foreign");
  fixture.exists = state !== "missing";
  await render();
  await press("Open attachment");
  expect(container.querySelector("output")).toBeNull();
  expect(container.textContent).toContain("Preview could not be opened.");
  expect(onRemove).not.toHaveBeenCalled();
});

it("rejects a persisted identifier containing path segments before looking up the file", async () => {
  await render([{ ...file, id: "../pdf" }]);
  await press("Open attachment");
  expect(fixture.owns).not.toHaveBeenCalled();
  expect(container.querySelector("output")).toBeNull();
});
