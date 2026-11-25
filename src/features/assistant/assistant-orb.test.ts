// @vitest-environment happy-dom
import { act, createElement as h, useRef, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ reduced: true, repeat: vi.fn((value: number) => value), cancel: vi.fn() }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("react-native-svg", () => {
  const Group = ({ children }: PropsWithChildren) => h("svg", null, children);
  const Shape = (props: object) => h("g", { "data-shape": JSON.stringify(props) });
  return { default: Group, Circle: Shape, Defs: Group, Line: Shape, Path: Shape, RadialGradient: Group, Stop: Shape };
});
vi.mock("react-native-reanimated", () => ({ default: { View: ({ children }: PropsWithChildren) => h("div", null, children) },
  useSharedValue: (value: number) => useRef({ value }).current, useAnimatedStyle: (read: () => unknown) => read(),
  cancelAnimation: f.cancel, withRepeat: f.repeat, withTiming: (value: number) => value,
  Easing: { linear: (value: number) => value, sin: (value: number) => value, inOut: (value: unknown) => value },
}));
vi.mock("@/ui/use-reduced-motion", () => ({ useReducedMotionPreference: () => f.reduced }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("./assistant-avatar", () => ({ AssistantAvatar: () => null }));
import { AssistantOrb } from "./assistant-orb";
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root?.unmount()); f.reduced = true; vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("starts no decorative loops under reduced motion, slows a muted call and stops loops when idle", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(document.createElement("div"));
  await act(async () => root.render(h(AssistantOrb, { state: "thinking" })));
  expect(f.repeat).not.toHaveBeenCalled();
  f.reduced = false; await act(async () => root.render(h(AssistantOrb, { state: "thinking" })));
  expect(f.repeat).toHaveBeenCalledTimes(2);
  f.repeat.mockClear(); f.cancel.mockClear();
  // A muted live call keeps a slow rotation (the call is still connected); only idle and error stand still.
  await act(async () => root.render(h(AssistantOrb, { state: "muted" })));
  expect(f.cancel).toHaveBeenCalled(); expect(f.repeat).toHaveBeenCalledTimes(2);
  f.repeat.mockClear();
  await act(async () => root.render(h(AssistantOrb, { state: "idle" })));
  expect(f.repeat).not.toHaveBeenCalled();
});
