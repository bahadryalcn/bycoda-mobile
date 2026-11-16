// @vitest-environment happy-dom
import { act, createContext, createElement as h, useContext, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Disclosure } from "./disclosure";
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("./styles", () => ({ uiStyles: {} }));
vi.mock("./motion", () => ({ resize: undefined }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children), Pressable: ({ children, onPress, "aria-expanded": expanded, accessibilityLabel }: PropsWithChildren<{ onPress: () => void; "aria-expanded": boolean; accessibilityLabel: string }>) => h("button", { onClick: onPress, "aria-expanded": expanded, "aria-label": accessibilityLabel }, children) }));
vi.mock("react-native-reanimated", () => ({ default: { View: ({ children }: PropsWithChildren) => h("div", null, children) } }));
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => h("span", null, children) }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("panelui-native/components/collapsible", () => {
  const Context = createContext({ open: false, toggle: () => {} });
  const Root = ({ children, open, onOpenChange }: PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) => h(Context.Provider, { value: { open, toggle: () => onOpenChange(!open) } }, children);
  return { Collapsible: Object.assign(Root, {
    Trigger: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel: string }>) => { const { open, toggle } = useContext(Context); return h("button", { onClick: toggle, "aria-expanded": open, "aria-label": accessibilityLabel }, children); },
    Content: ({ children }: PropsWithChildren) => { const { open } = useContext(Context); return h("div", { "aria-hidden": !open, "data-body": true }, children); },
    Indicator: ({ children }: PropsWithChildren) => h("span", null, children),
  }) };
});
vi.mock("./disclosure-motion", () => ({ DisclosureChevron: () => null, DisclosureBody: ({ expanded, children }: PropsWithChildren<{ expanded: boolean }>) => h("div", { "aria-hidden": !expanded, "data-body": true }, children) }));
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const feedback = h("p", { role: "alert" }, "Correct the current value");
const render = (error: boolean) => act(async () => root.render(h(Disclosure, { label: "Options", detail: "Optional fields", feedback: error ? feedback : null }, h("input", { defaultValue: "retained draft" }))));
const toggle = () => act(async () => container.querySelector("button")!.click());
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it("keeps one accessible error outside both the collapsed body and its trigger", async () => {
  await render(true); const alert = container.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe("Correct the current value"); expect(alert?.closest("button,[aria-hidden=true]")).toBeNull();
  await toggle(); expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1); expect(container.querySelector('[role="alert"]')).toBe(alert);
  await toggle(); expect(container.querySelector('[data-body]')?.getAttribute("aria-hidden")).toBe("true"); expect(alert?.closest("[aria-hidden=true]")).toBeNull();
});

it("clears feedback without remounting or resetting a visited editor", async () => {
  await render(true); await toggle(); const input = container.querySelector("input")!; input.value = "unfinished input";
  await render(false); expect(container.querySelector('[role="alert"]')).toBeNull(); expect(container.querySelector("input")).toBe(input); expect(input.value).toBe("unfinished input");
  await toggle(); await toggle(); expect(container.querySelector("input")).toBe(input); expect(input.value).toBe("unfinished input");
});

it("keeps the existing lazy body and closed detail when no feedback is supplied", async () => {
  await render(false); expect(container.querySelector("input")).toBeNull(); expect(container.textContent).toContain("Optional fields");
  await toggle(); expect(container.querySelector("input")).not.toBeNull(); expect(container.textContent).not.toContain("Optional fields");
});
