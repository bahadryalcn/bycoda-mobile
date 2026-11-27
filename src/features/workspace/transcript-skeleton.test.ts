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
const motion = vi.hoisted(() => ({ animate: true }));
vi.mock("@/ui/use-feedback-animation", () => ({ useFeedbackAnimation: () => motion.animate }));
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
it("keeps the placeholder shapes but drops the pulse loops when feedback animation is off", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  act(() => root!.render(h(TranscriptSkeleton)));
  act(() => layout.resize!({ nativeEvent: { layout: { height: 800 } } }));
  const messages = container.querySelectorAll("[data-message]").length;
  expect(container.querySelectorAll("span").length).toBeGreaterThan(0);
  motion.animate = false;
  try {
    act(() => root!.render(h(TranscriptSkeleton, { label: "Loading" })));
    expect(container.querySelectorAll("span").length).toBe(0);
    expect(container.querySelectorAll("[data-message]").length).toBe(messages);
  } finally {
    motion.animate = true;
  }
});
