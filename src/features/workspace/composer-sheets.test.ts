// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ hasImage: vi.fn(async () => false) }));
const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
vi.mock("react-native", () => ({ View: wrapper }));
for (const icon of ["image", "camera", "clipboard-paste", "file", "clipboard-list", "circle-dashed", "lightbulb", "layout-template"])
  vi.doMock(`lucide-react-native/icons/${icon}`, () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
vi.mock("@/features/management/templates/template-library", () => ({ TemplateLibrary: () => null }));
vi.mock("./attachment-files", () => ({ clipboardHasImage: fixture.hasImage }));
vi.mock("@/ui/primitives", () => ({
  Body: wrapper, NavigationGroup: wrapper, SectionHeader: () => null, RowIcon: () => null,
  NavigationRow: ({ label, onPress }: { label: string; onPress(): void }) => createElement("button", { onClick: onPress }, label),
  Sheet: ({ visible, title, children }: PropsWithChildren<{ visible: boolean; title: string }>) =>
    visible ? createElement("section", { "aria-label": title }, children) : null,
}));

const { ComposerSheets } = await import("./composer-sheets");

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
const onChoose = vi.fn();
const labels = () => Array.from(container.querySelectorAll("section[aria-label='Add to message'] button")).map((button) => button.textContent);
const render = (pickerOpen = true) => act(async () => root.render(createElement(ComposerSheets, {
  scope: { machineId: "machine", sessionId: "session" }, pickerOpen, onPickerClose: vi.fn(),
  draftDetailsOpen: false, onDraftDetailsClose: vi.fn(), templateOpen: false, onTemplateOpen: vi.fn(),
  onTemplateClose: vi.fn(), onChoose, onInsertTemplate: vi.fn(),
})));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.hasImage.mockReset().mockResolvedValue(false);
  onChoose.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("offers the camera beside photos and files, and no paste without a clipboard image", async () => {
  await render();
  expect(labels()).toEqual(["Photos", "Camera", "Files", "Templates"]);
  await act(async () => (container.querySelectorAll("button")[1] as HTMLButtonElement).click());
  expect(onChoose).toHaveBeenCalledWith("camera");
});

it("offers Paste image while the clipboard holds an image, checked each time the sheet opens", async () => {
  fixture.hasImage.mockResolvedValue(true);
  await render();
  expect(labels()).toEqual(["Photos", "Camera", "Files", "Paste image", "Templates"]);
  await act(async () => (Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Paste image") as HTMLButtonElement).click());
  expect(onChoose).toHaveBeenCalledWith("clipboard");
  await render(false);
  fixture.hasImage.mockResolvedValue(false);
  await render(true);
  expect(labels()).not.toContain("Paste image");
  expect(fixture.hasImage).toHaveBeenCalledTimes(2);
});

it("does not read the clipboard while the sheet is closed", async () => {
  await render(false);
  expect(fixture.hasImage).not.toHaveBeenCalled();
});
