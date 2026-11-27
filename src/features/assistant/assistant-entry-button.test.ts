// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("react-native", () => ({ View: ({ children, style }: PropsWithChildren<{ style?: unknown }>) => h("div", { "data-dot": style ? "1" : undefined }, children) }));
vi.mock("expo-router", () => ({ router: { navigate: f.navigate } }));
vi.mock("lucide-react-native/icons/audio-lines", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { success: "green", warning: "yellow", danger: "red", background: "bg", text: "ink" } }) }));
vi.mock("@/ui/buttons", () => ({ IconButton: ({ label, onPress, onLongPress }: { label: string; onPress(): void; onLongPress?: () => void }) =>
  h("button", { "aria-label": label, onClick: onPress, onContextMenu: onLongPress }) }));
import { AssistantEntryButton, assistantEntryStatus } from "./assistant-entry-button";
import { useAssistantCall } from "./assistant-call-state";

it("maps the call to the desktop's status dot", () => {
  expect(assistantEntryStatus({ phase: "idle" })).toBe("standby");
  expect(assistantEntryStatus({ phase: "starting" })).toBe("connecting");
  expect(assistantEntryStatus({ phase: "idle", reconnecting: 1 })).toBe("connecting");
  expect(assistantEntryStatus({ phase: "listening" })).toBe("live");
  expect(assistantEntryStatus({ phase: "idle", error: new Error("x") })).toBe("error");
});

it("opens the assistant on tap, ignores a hold and names a running call", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(h(AssistantEntryButton)));
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("Assistant");
    expect(container.querySelector("[data-dot]")).toBeNull();
    await act(async () => button.click());
    // Each tap asks for the assistant home, so a conversation left open does not swallow the button.
    expect(f.navigate).toHaveBeenLastCalledWith({ pathname: "/assistant", params: { home: expect.any(String) } });
    await act(async () => { button.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })); });
    expect(f.navigate).toHaveBeenCalledTimes(1);
    await act(async () => useAssistantCall.setState({ phase: "listening" }));
    expect(container.querySelector("button")!.getAttribute("aria-label")).toBe("Assistant, voice call in progress");
    expect(container.querySelector("[data-dot]")).not.toBeNull();
  } finally {
    await act(async () => {
      root.unmount();
      useAssistantCall.setState({ phase: "idle" });
    });
    vi.unstubAllGlobals();
  }
});
