// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectRow } from "./project-row";
const state = vi.hoisted(() => ({ details: vi.fn(), fontScale: 2 }));
vi.mock("react-native", () => ({
  View: ({ children, style }: PropsWithChildren<{ style: object }>) => h("div", { "data-layout": JSON.stringify(style) }, children),
  Text: ({ children, numberOfLines, style }: PropsWithChildren<{ numberOfLines?: number; style: object }>) => h("span", { "data-lines": numberOfLines, "data-layout": JSON.stringify(style) }, children),
  useWindowDimensions: () => ({ width: 320, fontScale: state.fontScale }),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({
  PressableCard: ({ children, onLongPress, style }: PropsWithChildren<{ onLongPress: () => void; style: { minHeight: number } }>) => h("button", { onClick: onLongPress, "data-height": style.minHeight }, children),
  StatusText: ({ label }: { label: string }) => h("span", null, label),
  Badge: ({ label }: { label: string }) => h("span", null, label),
}));
vi.mock("@/ui/disclosure-motion", () => ({ DisclosureChevron: () => null }));
vi.mock("@/ui/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/ui/working-row-glow", () => ({ WorkingRowGlow: () => null }));
vi.mock("@/ui/swipe-actions", () => ({ SwipeActions: ({ children }: PropsWithChildren) => children }));
vi.mock("lucide-react-native/icons/corner-down-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/ellipsis", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square-pen", () => ({ default: () => null }));
vi.mock("./shared", () => ({ relativeTime: () => "Letzte Aktivität vor drei Wochen" }));
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; vi.unstubAllGlobals(); state.details.mockClear(); });
it("keeps full activity time visible and long project identity reachable at large text", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  act(() => root!.render(h(ProjectRow, { id: "p", name: "İstanbul platform araştırması 👩🏽‍💻", depth: 0, grouped: false, registered: true, running: 0, activeAt: 1, opening: false, disabled: false, onPress: vi.fn(), onOptions: state.details })));
  const timestamp = [...container.querySelectorAll("span")].find(node => node.textContent === "Letzte Aktivität vor drei Wochen")!;
  expect(timestamp.getAttribute("data-lines")).toBeNull();
  expect(timestamp.getAttribute("data-layout")).not.toContain('"maxWidth":"40%"');
  expect([...container.querySelectorAll("div")].some(node => node.getAttribute("data-layout")?.includes('"flexWrap":"wrap"'))).toBe(true);
  expect(Number(container.querySelector("button")!.getAttribute("data-height"))).toBeGreaterThanOrEqual(48);
  act(() => container.querySelector("button")!.click());
  expect(state.details).toHaveBeenCalledExactlyOnceWith("p");
  const name = [...container.querySelectorAll("span")].find(node => node.textContent?.startsWith("İstanbul"))!;
  expect(name.getAttribute("data-lines")).toBeNull();
});

it("shows needs-you ahead of running as the one row status", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.fontScale = 1;
  const container = document.createElement("div"); root = createRoot(container);
  act(() => root!.render(h(ProjectRow, { id: "p", name: "Project", depth: 0, grouped: false, registered: true, running: 2, needsYou: 1, opening: false, disabled: false, onPress: vi.fn(), onOptions: vi.fn() })));
  expect(container.textContent).toContain("Needs you");
  expect(container.textContent).not.toContain("2 running");
  state.fontScale = 2;
});
