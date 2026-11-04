// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ copied: [] as string[] }));
vi.mock("@/state/security",()=>({isAppAccessAllowed:()=>true,useSecurity:{getState:()=>({appState:"active",windowFocused:true}),subscribe:()=>()=>{}}}));
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
async function render(style: import("react-native").StyleProp<import("react-native").TextStyle>, source = text, hidden = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => root!.render(createElement(MessageReader, { text: source, textStyle: style, hideInternalMetadata: hidden })));
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
it("repeated copy presses before a render write the complete source once", async () => {
  await render({ fontSize: 17 });
  await click("Full text");
  await act(async () => {
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Copy message")!;
    button.click();
    button.click();
  });
  expect(state.copied).toEqual([text]);
});

it("does not restore a stale page when a shorter source later grows again",async()=>{
 const long="x".repeat(26000);await render({fontSize:17},long);await click("Full text");await click("Next");await click("Next");expect(container.textContent).toContain("3 / 3");
 await render({fontSize:17},"short");await render({fontSize:17},long);expect(container.textContent).toContain("1 / 3");
});

it("keeps hidden presentation metadata in the exact full-source copy",async()=>{
 const metadata="<oai-mem-citation>\n<citation_entries>\nMEMORY.md:1-2|note=[synthetic]\n</citation_entries>\n<rollout_ids>\nexample-id\n</rollout_ids>\n</oai-mem-citation>";
 const source="Begin\n\n"+metadata+"\n\n"+text;await render({fontSize:17},source,true);await click("Full text");expect(container.textContent).not.toContain("MEMORY.md:1-2");await click("Copy message");expect(state.copied).toEqual([source]);
});
