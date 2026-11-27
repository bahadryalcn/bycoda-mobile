// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, type PropsWithChildren, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TerminalOutputView } from "./terminal-output-view";

const fixture = vi.hoisted(() => ({ scrollToEnd: vi.fn(), content: () => {},
  scroll: undefined as undefined | ((event: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) => void),
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  ScrollView: ({ children, ref, onContentSizeChange, onScroll }: PropsWithChildren<{ ref: Ref<unknown>; onContentSizeChange: () => void; onScroll: typeof fixture.scroll }>) => {
    useImperativeHandle(ref, () => ({ scrollToEnd: fixture.scrollToEnd }));
    fixture.content = onContentSizeChange; fixture.scroll = onScroll;
    return createElement("section", { "data-output-scroll": true }, children);
  },
}));
vi.mock("lucide-react-native/icons/arrow-down-to-line", () => ({ default: () => null }));
vi.mock("@/ui/tokens", () => ({ darkColors: { background: "black", text: "white" }, iconSize: { action: 20 }, space: { xs: 4, md: 12, xl: 20 },
  terminalAnsiPalettes: { dark: Array.from({ length: 16 }, (_, index) => index === 1 ? "#EF7777" : "#888888"),
    light: Array.from({ length: 16 }, (_, index) => index === 1 ? "#EF7777" : "#888888") } }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "light", colors: { text: "ink", panel: "paper" } }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, params?: Record<string, number>) => en.replace(/\{(p\d+)\}/g, (_match, key: string) => String(params?.[key] ?? key)) }));
vi.mock("@/ui/primitives", () => {
  return { CodeText: ({ children, style }: PropsWithChildren<{ style?: React.CSSProperties }>) => createElement("span", { style }, children),
    IconButton: ({ label, disabled, onPress, expanded }: { label: string; disabled?: boolean; onPress: () => void; expanded?: boolean }) => createElement("button", { disabled, onClick: onPress, "aria-expanded": expanded }, label),
  };
});

let root: Root | undefined;
const container = document.createElement("div");
async function render(output = "Starting\nERROR: build failed\nCompleted", query = "") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root ??= createRoot(container);
  await act(async () => root!.render(createElement(TerminalOutputView, { output, query })));
}
async function press(label: string) {
  const button = [...container.querySelectorAll("button")].find(button => button.textContent === label)!;
  await act(async () => button.click());
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("filters complete output lines locally and restores the transcript when cleared", async () => {
  const output = "Starting\n\u001b[31mERROR: build failed\u001b[0m\nCompleted";
  await render(output, "error");
  expect(container.querySelector("section")!.textContent).toBe("ERROR: build failed");
  expect(container.querySelector("button")).toBeNull();
  await render(output);
  expect(container.querySelector("section")!.textContent).toBe("Starting\nERROR: build failed\nCompleted");
  expect(container.querySelector<HTMLElement>("span span")?.style.color).toBe("#EF7777");
});
it("stops following when the user reads older output and resumes only on explicit follow", async () => {
  await render();
  fixture.scrollToEnd.mockClear();
  await act(async () => fixture.content()); expect(fixture.scrollToEnd).toHaveBeenCalledOnce();
  await act(async () => fixture.scroll!({ nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 300 }, contentSize: { height: 2000 } } }));
  fixture.scrollToEnd.mockClear(); await render("Additional output");
  await act(async () => fixture.content()); expect(fixture.scrollToEnd).not.toHaveBeenCalled();
  await press("Follow latest output"); expect(fixture.scrollToEnd).toHaveBeenCalledOnce();
});
