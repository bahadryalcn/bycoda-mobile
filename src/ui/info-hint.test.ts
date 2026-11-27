// @vitest-environment happy-dom
import { act, cloneElement, createContext, createElement as h, useContext, type PropsWithChildren, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HintLabel, LABEL_IN_ROW, isUnitHint } from "./info-hint";
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("./motion", () => ({ reveal: undefined }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string>) => en.replace("{p0}", values?.p0 ?? "") }));
vi.mock("./layout", () => ({ SectionHeader: () => null }));
vi.mock("./typography", () => ({ Body: ({ children, selectable, style }: PropsWithChildren<{ selectable?: boolean; style?: unknown }>) =>
  h("span", { "data-selectable": selectable, "data-style": JSON.stringify(style ?? null) }, children) }));
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
  Pressable: ({ children, onPress, accessibilityLabel, accessibilityHint, "aria-expanded": expanded }: PropsWithChildren<{ onPress: () => void; accessibilityLabel: string; accessibilityHint?: string; "aria-expanded": boolean }>) =>
    h("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-description": accessibilityHint, "aria-expanded": expanded }, children),
}));
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
const HELP = "Used only to sign you in to this computer.";

it("opens the actual explanation as one tooltip and labels the icon for assistive tech", async () => {
  await act(async () => root.render(h(HintLabel, { label: "Token", help: HELP })));
  expect(container.textContent).toBe("Token");
  const button = container.querySelector("button")!;
  // A short name for the button; the explanation is its hint (the tooltip itself is hidden from assistive tech).
  expect(button.getAttribute("aria-label")).toBe("Information about Token");
  expect(button.getAttribute("aria-description")).toBe(HELP);
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
  expect(button.getAttribute("aria-label")).toBe("Information about Scope");
  expect(button.getAttribute("aria-description")).toBe("Per project");
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

// Android drew "Acil hatırlatıcılar" as "Acil" with the icon floating after it: a shrink-only label was
// measured at its one-line width and wrapped when drawn. The label now owns the row's free width.
it("lets a label beside its info icon take the row's free width so Android wraps it instead of clipping", async () => {
  await act(async () => root.render(h(HintLabel, { label: "Urgent reminders", help: HELP })));
  const label = [...container.querySelectorAll("span")].find(node => node.textContent === "Urgent reminders")!;
  expect(JSON.parse(label.getAttribute("data-style")!)).toContainEqual(LABEL_IN_ROW);
  expect(LABEL_IN_ROW).toMatchObject({ flexGrow: 1, flexShrink: 1, minWidth: 0 });
  // A visible explanation has no icon, so the label keeps the plain column layout.
  await act(async () => root.render(h(HintLabel, { label: "Token", help: HELP, presentation: "visible" })));
  const plain = [...container.querySelectorAll("span")].find(node => node.textContent === "Token")!;
  expect(plain.getAttribute("data-style")).not.toContain("flexGrow");
});
