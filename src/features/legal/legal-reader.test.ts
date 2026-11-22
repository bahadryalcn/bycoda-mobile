// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ left: 0, right: 44, rtl: false, content: {} as Record<string, number>, tracked: [] as string[] }));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 800, fontScale: 2 }),
  View: ({ children }: PropsWithChildren) => createElement("div", { dir: fixture.rtl ? "rtl" : "ltr" }, children),
  ScrollView: ({ children, contentContainerStyle }: PropsWithChildren<{ contentContainerStyle: Record<string, number> }>) => { fixture.content = contentContainerStyle; return createElement("div", null, children); },
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ left: fixture.left, right: fixture.right, top: 0, bottom: 20 }) }));
vi.mock("panelui-native/hooks/use-scroll-sections", () => ({ useScrollSections: ({ ids }: { ids: string[] }) => {
  fixture.tracked = ids;
  return { ref: undefined, scrollProps: {}, measure: () => () => {}, scrollTo: vi.fn() };
} }));
vi.mock("@/ui/section-progress", () => ({
  SectionNavigator: ({ sections }: { sections: { id: string; title: string }[] }) =>
    createElement("nav", null, sections.map(({ id, title }) => createElement("span", { key: id }, title))),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/dialogs", () => ({
  Sheet: ({ children, visible, title, scroll }: PropsWithChildren<{ visible: boolean; title: string; scroll: boolean }>) =>
    visible ? createElement("section", { "aria-label": title, "data-scroll": scroll }, children) : null,
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./legal-document", () => ({
  LegalDocument: () => null,
  legalDocumentTitle: (document: string) => document,
  legalSectionId: (index: number) => `section-${index}`,
}));
import { LegalDocumentSheet, LegalReader } from "./legal-reader";
it.each([[0, 44, false], [44, 0, false], [0, 44, true], [44, 0, true]] as const)("reserves physical safe edges left=%s right=%s in RTL=%s", async (left, right, rtl) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fixture.left = left; fixture.right = right; fixture.rtl = rtl;
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(LegalReader, { document: "privacy" })));
    const paddingLeft = fixture.content.paddingLeft ?? fixture.content.paddingHorizontal ?? 0;
    const paddingRight = fixture.content.paddingRight ?? fixture.content.paddingHorizontal ?? 0;
    expect(paddingLeft).toBe(Math.max(16, left)); expect(paddingRight).toBe(Math.max(16, right));
    const textLeft = paddingLeft, textRight = 390 - paddingRight;
    expect(textLeft).toBeGreaterThanOrEqual(left); expect(textRight).toBeLessThanOrEqual(390 - right);
    expect(textRight - textLeft).toBe(330);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it.each([
  ["terms", ["mit-license", "contact-links"], "MIT licenseContact & links"],
  ["privacy", ["contact-links"], "Contact & links"],
] as const)("tracks the final %s sections in reading order", async (document, ids, titles) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = window.document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(LegalReader, { document })));
    expect(fixture.tracked.slice(-ids.length)).toEqual(ids);
    expect(container.querySelector("nav")?.textContent?.endsWith(titles)).toBe(true);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("gives long public documents a section list and one scroll owner inside the sheet", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onClose = vi.fn();
  try {
    await act(async () => root.render(createElement(LegalDocumentSheet, { document: "terms", onClose })));
    expect(container.querySelector("section[aria-label=terms]")?.getAttribute("data-scroll")).toBe("false");
    expect(container.querySelector("nav")?.textContent).toContain("MIT license");

    await act(async () => root.render(createElement(LegalDocumentSheet, { document: "help", onClose })));
    expect(container.querySelector("section[aria-label=help]")?.getAttribute("data-scroll")).toBe("true");
    expect(container.querySelector("nav")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
