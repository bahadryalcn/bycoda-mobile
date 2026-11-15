// @vitest-environment happy-dom
import { act, createElement, useImperativeHandle, type PropsWithChildren, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TerminalOutputView } from "./terminal-output-view";

const fixture = vi.hoisted(() => ({ copy: vi.fn(), scrollToEnd: vi.fn(), content: () => {},
  scroll: undefined as undefined | ((event: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) => void),
  payload: "", enabled: false,
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  ScrollView: ({ children, ref, onContentSizeChange, onScroll }: PropsWithChildren<{ ref: Ref<unknown>; onContentSizeChange: () => void; onScroll: typeof fixture.scroll }>) => {
    useImperativeHandle(ref, () => ({ scrollToEnd: fixture.scrollToEnd }));
    fixture.content = onContentSizeChange; fixture.scroll = onScroll;
    return createElement("section", { "data-output-scroll": true }, children);
  },
}));
vi.mock("lucide-react-native/icons/copy", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/search", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-down-to-line", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/tokens", () => ({ radii: { control: 10 }, space: { xs: 4, md: 12, xl: 20 } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, params?: Record<string, number>) => en.replace(/\{(p\d+)\}/g, (_match, key: string) => String(params?.[key] ?? key)) }));
vi.mock("@/ui/use-clipboard-feedback", () => ({ useClipboardFeedback: (payload: string, enabled: boolean) => {
  fixture.payload = payload; fixture.enabled = enabled;
  return { copy: fixture.copy, busy: false, copied: false, error: null };
} }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Row: Group, CodeText: ({ children }: PropsWithChildren) => createElement("pre", null, children), ErrorNotice: () => null,
    IconButton: ({ label, disabled, onPress, expanded }: { label: string; disabled?: boolean; onPress: () => void; expanded?: boolean }) => createElement("button", { disabled, onClick: onPress, "aria-expanded": expanded }, label),
    SearchField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) => createElement("input", { "aria-label": label, value, onInput: event => onChangeText(event.currentTarget.value) }),
  };
});

let root: Root | undefined;
const container = document.createElement("div");
async function render(output = "Starting\nERROR: build failed\nCompleted") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root ??= createRoot(container);
  await act(async () => root!.render(createElement(TerminalOutputView, { output })));
}
async function press(label: string) {
  const button = [...container.querySelectorAll("button")].find(button => button.textContent === label)!;
  await act(async () => button.click());
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("filters complete output lines locally while copying the full captured output", async () => {
  await render(); await press("Search output");
  const input = container.querySelector("input")!;
  await act(async () => { input.value = "error"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(container.querySelector("pre")!.textContent).toBe("ERROR: build failed");
  expect(container.textContent).toContain("Matching lines: 1");
  expect(fixture.payload).toBe("Starting\nERROR: build failed\nCompleted");
  await press("Copy output"); expect(fixture.copy).toHaveBeenCalledOnce();
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Follow latest output")!.disabled).toBe(true);
  await press("Search output");
  expect(container.querySelector("pre")!.textContent).toBe(fixture.payload);
});
it("stops following when the user reads older output and resumes only on explicit follow", async () => {
  await render();
  await act(async () => fixture.content()); expect(fixture.scrollToEnd).toHaveBeenCalledOnce();
  await act(async () => fixture.scroll!({ nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 300 }, contentSize: { height: 2000 } } }));
  fixture.scrollToEnd.mockClear(); await render("Additional output");
  await act(async () => fixture.content()); expect(fixture.scrollToEnd).not.toHaveBeenCalled();
  await press("Follow latest output"); expect(fixture.scrollToEnd).toHaveBeenCalledOnce();
});
