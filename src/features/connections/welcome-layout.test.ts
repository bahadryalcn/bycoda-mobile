// @vitest-environment happy-dom
import { createElement as h, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WelcomeScreen } from "./welcome-screen";
const layout = vi.hoisted(() => ({ inset: 140, content: {} as Record<string, number> }));
const passThrough = vi.hoisted(() => ({ children }: { children?: unknown }) => children);
vi.mock("react-native", () => ({ useWindowDimensions: () => ({ width: 390, height: 844 }), View: passThrough, ScrollView: ({ children, contentContainerStyle }: PropsWithChildren<{ contentContainerStyle: Record<string, number> }>) => { layout.content = contentContainerStyle; return h("main", null, children); } }));
vi.mock("react-native-reanimated", () => {
  const animation = { duration: () => animation, delay: () => animation, reduceMotion: () => animation };
  return { default: { View: passThrough }, FadeIn: animation, FadeInDown: animation, ReduceMotion: { System: "system" } };
});
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() }, Stack: { Screen: () => null } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 44 }) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/layout", () => ({ useBottomInset: () => layout.inset }));
vi.mock("./account-computers-section", () => ({ AccountComputersSection: ({ others }: { others: unknown }) => others }));
vi.mock("@/ui/primitives", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children), Heading: ({ children }: PropsWithChildren) => h("h2", null, children), Button: () => null }));
vi.mock("@/ui/code-art", () => ({ CodeArt: () => null, codeArtWidth: () => 200 }));
vi.mock("@/ui/dot-field", () => ({ DotField: () => null }));
it("reserves measured navigation once and respects each landscape safe edge", () => {
  expect(renderToStaticMarkup(h(WelcomeScreen))).toContain("Connect your computer");
  expect(layout.content.paddingBottom).toBe(140 + 16);
  expect(layout.content.paddingEnd).toBe(44);
  layout.inset = 0; renderToStaticMarkup(h(WelcomeScreen));
  expect(layout.content.paddingBottom).toBe(34 + 16);
});
