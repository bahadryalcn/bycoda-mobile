// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ left: 0, right: 44, rtl: false, content: {} as Record<string, number> }));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 390, height: 800, fontScale: 2 }),
  View: ({ children }: PropsWithChildren) => createElement("div", { dir: fixture.rtl ? "rtl" : "ltr" }, children),
  ScrollView: ({ children, contentContainerStyle }: PropsWithChildren<{ contentContainerStyle: Record<string, number> }>) => { fixture.content = contentContainerStyle; return createElement("div", null, children); },
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ left: fixture.left, right: fixture.right, top: 0, bottom: 20 }) }));
vi.mock("panelui-native/hooks/use-scroll-sections", () => ({ useScrollSections: () => ({ ref: undefined, scrollProps: {}, measure: () => () => {}, scrollTo: vi.fn() }) }));
vi.mock("@/ui/section-progress", () => ({ SectionNavigator: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./legal-document", () => ({ LegalDocument: () => null, legalSectionId: (index: number) => `section-${index}` }));
import { LegalReader } from "./legal-reader";
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
