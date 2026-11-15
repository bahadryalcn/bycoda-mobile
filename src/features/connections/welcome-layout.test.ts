// @vitest-environment happy-dom
import { createElement as h, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WelcomeScreen } from "./welcome-screen";
const layout = vi.hoisted(() => ({ inset: 140, content: {} as Record<string, number> }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children), ScrollView: ({ children, contentContainerStyle }: PropsWithChildren<{ contentContainerStyle: Record<string, number> }>) => { layout.content = contentContainerStyle; return h("main", null, children); } }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() }, Stack: { Screen: () => null } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 34, left: 0, right: 44 }) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/layout", () => ({ useBottomInset: () => layout.inset }));
vi.mock("@/ui/brand", () => ({ BrandLogo: () => null, LegalLinks: () => h("footer", null, "Privacy") }));
vi.mock("./account-computers-section", () => ({ AccountComputersSection: () => null }));
vi.mock("@/ui/primitives", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children), Heading: ({ children }: PropsWithChildren) => h("h2", null, children), StateView: () => null }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: () => null }));
vi.mock("lucide-react-native/icons/laptop", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/folder-open", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/message-square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shield-check", () => ({ default: () => null }));
it("reserves measured navigation once and respects each landscape safe edge", () => {
  expect(renderToStaticMarkup(h(WelcomeScreen))).toContain("Privacy");
  expect(layout.content.paddingBottom).toBe(140);
  expect(layout.content.paddingEnd).toBe(44);
  layout.inset = 0; renderToStaticMarkup(h(WelcomeScreen));
  expect(layout.content.paddingBottom).toBe(34);
});
