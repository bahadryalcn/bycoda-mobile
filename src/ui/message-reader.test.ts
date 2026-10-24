// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ copied: [] as string[] }));
vi.mock("react-native", () => ({
  ScrollView: ({ children }: { children: import("react").ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("expo-clipboard", () => ({
  setStringAsync: async (text: string) => {
    state.copied.push(text);
  },
}));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./primitives", () => ({
  Body: ({ children, style }: { children: import("react").ReactNode; style: unknown }) =>
    createElement(
      "span",
      { "data-reader-style": style ? JSON.stringify(style) : undefined },
      children,
    ),
  Row: ({ children }: { children: import("react").ReactNode }) =>
    createElement("div", null, children),
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, label),
  Sheet: ({
    visible,
    children,
    footer,
  }: {
    visible: boolean;
    children: import("react").ReactNode;
    footer: import("react").ReactNode;
  }) => (visible ? createElement("section", null, children, footer) : null),
  ErrorText: () => null,
}));
import { MessageReader } from "./message-reader";
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
const text = "first page " + "x".repeat(12100) + "🙂 last page";
async function render(style: import("react-native").StyleProp<import("react-native").TextStyle>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => root!.render(createElement(MessageReader, { text, textStyle: style })));
}
async function click(label: string) {
  await act(async () =>
    [...container.querySelectorAll("button")].find((b) => b.textContent === label)!.click(),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  state.copied = [];
  vi.unstubAllGlobals();
});
it("keeps the selected role/reader style on every page and updates it without resetting pagination", async () => {
  await render({ fontSize: 18, lineHeight: 26 });
  await click("Full text");
  expect(
    container.querySelector("[data-reader-style]")?.getAttribute("data-reader-style"),
  ).toContain('"fontSize":18');
  await click("Next");
  expect(container.textContent).toContain("last page");
  await render([{ fontSize: 20, lineHeight: 29 }, { fontWeight: "600" }]);
  expect(
    container.querySelector("[data-reader-style]")?.getAttribute("data-reader-style"),
  ).toContain('"fontSize":20');
  expect(container.textContent).toContain("last page");
  expect(container.textContent).toContain("2 / 2");
});
it("copy remains the exact complete original source while reading a paged styled view", async () => {
  await render({ fontSize: 17 });
  await click("Full text");
  await click("Next");
  await click("Copy message");
  expect(state.copied).toEqual([text]);
});
