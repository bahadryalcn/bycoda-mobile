// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HintLabel, isUnitHint } from "./info-hint";
vi.mock("./theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./motion", () => ({ reveal: undefined }));
vi.mock("./layout", () => ({ SectionHeader: () => null }));
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => h("span", null, children) }));
vi.mock("lucide-react-native/icons/info", () => ({ default: () => null }));
vi.mock("react-native-reanimated", () => ({ default: { View: ({ children }: PropsWithChildren) => h("div", null, children) } }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => h("div", null, children),
  Pressable: ({ children, onPress, accessibilityLabel, "aria-expanded": expanded }: PropsWithChildren<{ onPress: () => void; accessibilityLabel: string; "aria-expanded": boolean }>) =>
    h("button", { onClick: onPress, "aria-label": accessibilityLabel, "aria-expanded": expanded }, children),
}));
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
const HELP = "Used only to sign you in to this computer.";

it("hides the explanation until the info icon is tapped, and labels it for assistive tech", async () => {
  await act(async () => root.render(h(HintLabel, { label: "Token", help: HELP })));
  expect(container.textContent).toBe("Token");
  const button = container.querySelector("button")!;
  expect(button.getAttribute("aria-label")).toBe(`Info: ${HELP}`);
  expect(button.getAttribute("aria-expanded")).toBe("false");
  await act(async () => button.click());
  expect(container.textContent).toContain(HELP);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  await act(async () => button.click());
  expect(container.textContent).toBe("Token");
});

it("renders no icon without help and none for a short unit hint", async () => {
  await act(async () => root.render(h(HintLabel, { label: "Limit", help: "0 = unlimited" })));
  expect(container.querySelector("button")).toBeNull();
  expect(isUnitHint("0 = unlimited")).toBe(true);
  expect(isUnitHint(HELP)).toBe(false);
});
