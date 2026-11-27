// @vitest-environment happy-dom
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("./primitives", () => ({
  Body: ({ children }: { children: React.ReactNode }) => createElement("span", null, children),
  Row: ({ children }: { children: React.ReactNode }) => createElement("div", null, children),
}));
// The glyph-only variant wraps in a native View; react-native itself is Flow source vitest cannot parse.
vi.mock("react-native", () => ({
  View: ({ children, accessibilityLabel }: { children: React.ReactNode; accessibilityLabel?: string }) =>
    createElement("span", { "aria-label": accessibilityLabel }, children),
}));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: { muted: "gray" } }) }));
vi.mock("lucide-react-native/icons/user-round", () => ({
  default: () => createElement("i", { "data-icon": "user" }),
}));
vi.mock("lucide-react-native/icons/briefcase", () => ({
  default: () => createElement("i", { "data-icon": "briefcase" }),
}));
import { ProviderAccountKind } from "./provider-account-kind";
it("labels work accounts and defaults to personal with matching icons", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  try {
    await act(async () => root.render(createElement(ProviderAccountKind, { kind: "work" })));
    expect(node.textContent).toBe("Work");
    expect(node.querySelector('[data-icon="briefcase"]')).not.toBeNull();
    await act(async () => root.render(createElement(ProviderAccountKind, {})));
    expect(node.textContent).toBe("Personal");
    expect(node.querySelector('[data-icon="user"]')).not.toBeNull();
    await act(async () => root.render(createElement(ProviderAccountKind, { kind: "work", iconOnly: true })));
    expect(node.textContent).toBe("");
    expect(node.querySelector('[aria-label="Work"] [data-icon="briefcase"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
