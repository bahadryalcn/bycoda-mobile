// @vitest-environment happy-dom
import { act, cloneElement, createContext, createElement as h, useContext, type PropsWithChildren, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HintLabel, isUnitHint } from "./info-hint";
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("./motion", () => ({ reveal: undefined }));
vi.mock("./layout", () => ({ SectionHeader: () => null }));
vi.mock("./typography", () => ({ Body: ({ children, selectable }: PropsWithChildren<{ selectable?: boolean }>) => h("span", { "data-selectable": selectable }, children) }));
vi.mock("lucide-react-native/icons/info", () => ({ default: () => null }));
vi.mock("react-native-reanimated", () => ({ default: { View: ({ children }: PropsWithChildren) => h("div", null, children) } }));
vi.mock("panelui-native/components/tooltip", () => {
  const Context = createContext({ open: false, activate: () => {} });
  return {
    Tooltip: Object.assign(
      ({ children, open, openOn, onOpenChange }: PropsWithChildren<{ open: boolean; openOn: string; onOpenChange: (open: boolean) => void }>) =>
        h(Context.Provider, { value: { open, activate: () => { if (openOn === "press") onOpenChange(!open); } } }, children),
      {
        Trigger: ({ children }: { children: ReactElement<{ onPress?: () => void }> }) =>
          cloneElement(children, { onPress: useContext(Context).activate }),
        Content: ({ children }: PropsWithChildren) => useContext(Context).open ? h("div", { role: "tooltip" }, children) : null,
        Text: ({ children }: PropsWithChildren) => h("span", null, children),
      },
    ),
  };
});
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => h("div", null, children),
  Pressable: ({ children, onPress, accessibilityLabel, "aria-expanded": expanded }: PropsWithChildren<{ onPress: () => void; accessibilityLabel: string; "aria-expanded": boolean }>) =>
    h("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-expanded": expanded }, children),
}));
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
const HELP = "Used only to sign you in to this computer.";

it("opens the actual explanation as one tooltip and labels the icon for assistive tech", async () => {
  await act(async () => root.render(h(HintLabel, { label: "Token", help: HELP })));
  expect(container.textContent).toBe("Token");
  const button = container.querySelector("button")!;
  expect(button.getAttribute("aria-label")).toBe(HELP);
  expect(button.getAttribute("aria-expanded")).toBeNull();
  await act(async () => button.click());
  expect(container.querySelector('[role="tooltip"]')?.textContent).toBe(HELP);
  await act(async () => button.click());
  expect(container.textContent).toBe("Token");
});

it("reveals even a short explicit info text behind the icon when always is set", async () => {
  await act(async () => root.render(h(HintLabel, { label: "Scope", help: "Per project", always: true })));
  expect(container.textContent).toBe("Scope");
  const button = container.querySelector("button")!;
  expect(button.getAttribute("aria-label")).toBe("Per project");
  await act(async () => button.click());
  expect(container.textContent).toContain("Per project");
});

it("keeps essential instructions visible and rich details readable inline", async () => {
  await act(async () => root.render(h(HintLabel, { label: "Token", help: HELP, presentation: "visible" })));
  expect(container.textContent).toContain(HELP);
  expect(container.querySelector("button")).toBeNull();

  await act(async () => root.render(h(HintLabel, { label: "Token", help: HELP, presentation: "inline" })));
  const button = container.querySelector("button")!;
  expect(button.getAttribute("aria-expanded")).toBe("false");
  await act(async () => button.click());
  expect(container.textContent).toContain(HELP);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(container.querySelector('[role="tooltip"]')).toBeNull();
});

it("renders no icon without help and none for a short unit hint", async () => {
  await act(async () => root.render(h(HintLabel, { label: "Limit", help: "0 = unlimited" })));
  expect(container.firstElementChild?.tagName).toBe("SPAN");
  expect(container.firstElementChild?.getAttribute("data-selectable")).toBe("false");
  expect(container.querySelector("button")).toBeNull();
  expect(isUnitHint("0 = unlimited")).toBe(true);
  expect(isUnitHint(HELP)).toBe(false);
});
