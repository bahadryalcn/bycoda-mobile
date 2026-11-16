// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TranscriptSkeleton } from "./transcript-skeleton";
const layout = vi.hoisted(() => ({ resize: undefined as undefined | ((event: any) => void) }));
vi.mock("react-native", () => ({ View: ({ children, onLayout, importantForAccessibility }: PropsWithChildren<any>) => {
  if (onLayout) layout.resize = onLayout;
  return h("div", { "data-message": importantForAccessibility === "no-hide-descendants" ? true : undefined }, children);
} }));
vi.mock("panelui-native/components/skeleton", () => ({ Skeleton: () => h("span") }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/use-delayed-visible", () => ({ useDelayedVisible: () => true }));
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); vi.unstubAllGlobals(); });
it("fills the transcript region and adapts when keyboard or orientation reduces its height", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  act(() => root!.render(h(TranscriptSkeleton)));
  expect(layout.resize).toBeTypeOf("function");
  act(() => layout.resize!({ nativeEvent: { layout: { height: 800 } } }));
  const tall = container.querySelectorAll("[data-message]").length;
  expect(tall).toBeGreaterThan(3);
  act(() => layout.resize!({ nativeEvent: { layout: { height: 200 } } }));
  expect(container.querySelectorAll("[data-message]").length).toBeLessThan(tall);
});
