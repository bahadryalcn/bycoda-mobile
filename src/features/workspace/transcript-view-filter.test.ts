// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TranscriptViewFilter } from "./transcript-view-filter";

vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityState, ...props }: PropsWithChildren<{ onPress: () => void; accessibilityLabel: string; accessibilityState: { selected?: boolean; disabled: boolean }; "aria-pressed"?: boolean }>) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-pressed": props["aria-pressed"], "data-native-selected": accessibilityState.selected, disabled: accessibilityState.disabled }, children),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => null }));
// Keep the real row accessibility behavior without loading native animation runtimes.
vi.mock("@/ui/busy-indicator", () => ({ BusyIndicator: () => null }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ colors: {}, opacity: {}, semanticColors: {}, space: {} }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/sliders-horizontal", () => ({ default: () => null }));
vi.mock("@/ui/chat-controls", () => ({ ChatToolbarAction: ({ onPress }: { onPress: () => void }) => createElement("button", { onClick: onPress }, "Chat view") }));
vi.mock("@/ui/primitives", async () => ({
  ...(await import("@/ui/navigation-row")),
  Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) => visible ? createElement("div", null, children) : null,
}));
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); });

it.each(["messages", "details"] as const)("exposes the current %s option to native and web accessibility", async (value) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  const onChange = vi.fn();
  await act(async () => root.render(createElement(TranscriptViewFilter, { value, onChange })));
  await act(async () => container.querySelector("button")!.click());
  const rows = [...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
  expect(rows.map((row) => row.getAttribute("aria-pressed"))).toEqual(value === "messages" ? ["true", "false"] : ["false", "true"]);
  expect(rows.map((row) => row.getAttribute("data-native-selected"))).toEqual(value === "messages" ? ["true", "false"] : ["false", "true"]);
  await act(async () => rows[value === "messages" ? 1 : 0].click());
  expect(onChange).toHaveBeenCalledWith(value === "messages" ? "details" : "messages");
});
