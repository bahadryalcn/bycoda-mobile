// @vitest-environment jsdom
import { act, createElement as h, useEffect, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
// The in-place selection layer is native-only; here the paragraph renders as is.
vi.mock("@/ui/message-selection", () => ({ SelectableProse: ({ children }: PropsWithChildren) => children }));
// The mock lays out one line per "\n"-separated segment, standing in for native text layout.
vi.mock("@/ui/primitives", () => ({
  Body: ({
    children,
    numberOfLines,
    onTextLayout,
  }: PropsWithChildren<{
    numberOfLines?: number;
    onTextLayout?: (event: { nativeEvent: { lines: unknown[] } }) => void;
  }>) => {
    // Reports layout once mounted, like native onTextLayout.
    useEffect(() => {
      onTextLayout?.({ nativeEvent: { lines: String(children).split("\n") } });
    }, [children, onTextLayout]);
    return h(onTextLayout ? "i" : "p", { "data-lines": numberOfLines }, children);
  },
}));
vi.mock("panelui-native/components/collapsible", async () => {
  const { createContext, useContext } = await import("react");
  const Toggle = createContext<() => void>(() => undefined);
  const Collapsible = ({ children, open, onOpenChange }: PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) =>
    h(Toggle.Provider, { value: () => onOpenChange(!open) }, h("div", null, children));
  Collapsible.Trigger = ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel: string }>) =>
    h("button", { onClick: useContext(Toggle) }, accessibilityLabel, children);
  Collapsible.Title = () => null;
  Collapsible.Indicator = () => null;
  return { Collapsible };
});
vi.mock("@/ui/chat-styles", () => ({ useChatTextStyles: () => ({}) }));
vi.mock("@/state/chat-appearance", () => ({ useChatAppearance: () => "standard" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
import { UserMessageText } from "./user-message-text";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = "";
});

async function render(text: string, preview?: string) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(h(UserMessageText, { text, preview })));
  return container;
}

describe("user message text", () => {
  it("shows a prompt that fits in four laid-out lines without Show more", async () => {
    const container = await render("**not markdown**\nb\nc\nd");
    expect(container.querySelector("p")?.textContent).toBe("**not markdown**\nb\nc\nd");
    expect(container.querySelector("button")).toBeNull();
  });
  it("offers Show more only when the measured text exceeds four lines", async () => {
    const container = await render("a\nb\nc\nd\ne");
    expect(container.querySelector("p")?.getAttribute("data-lines")).toBe("4");
    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("Show more");
    await act(async () => button.click());
    expect(container.querySelector("p")?.hasAttribute("data-lines")).toBe(false);
    expect(container.querySelector("i")).toBeNull();
    expect(container.querySelector("button")?.textContent).toBe("Show less");
  });
  it("does not guess overflow from length alone", async () => {
    const container = await render("x".repeat(400));
    expect(container.querySelector("button")).toBeNull();
  });
  it("shows the task objective first and lets the owner reopen the full execution prompt", async () => {
    const text = "Generated execution instructions.\n\nCheck the receipt layout.";
    const container = await render(text, "Check the receipt layout.");
    expect(container.querySelector("p")?.textContent).toBe("Check the receipt layout.");
    expect(container.textContent).not.toContain("Generated execution instructions.");
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector("p")?.textContent).toBe(text);
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector("p")?.textContent).toBe("Check the receipt layout.");
  });
});
