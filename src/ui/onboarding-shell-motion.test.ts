import { createElement as h, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ reduced: false, entering: [] as unknown[] }));
vi.mock("react-native", () => {
  const box = ({ children }: PropsWithChildren) => h("div", null, children);
  return { StyleSheet: { absoluteFill: {} }, View: box, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }) };
});
vi.mock("react-native-reanimated", () => {
  const animation = { duration: () => animation, delay: () => animation, reduceMotion: () => animation, easing: () => animation };
  return {
    default: { View: ({ children, entering }: PropsWithChildren<{ entering?: unknown }>) => { state.entering.push(entering); return h("section", null, children); } },
    FadeIn: animation, FadeOut: animation, FadeInDown: animation, LinearTransition: animation, Easing: { bezier: () => null, out: () => null, cubic: null },
    ReduceMotion: { System: "system" }, useReducedMotion: () => state.reduced, useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: () => ({}), withSpring: () => 0, withTiming: () => 0,
  };
});
vi.mock("expo-haptics", () => ({}));
vi.mock("react-native-keyboard-controller", () => ({ KeyboardAvoidingView: ({ children }: PropsWithChildren) => h("main", null, children) }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("./onboarding-pager", () => ({ OnboardingPager: () => null, PageDots: () => null }));
vi.mock("./dot-field", () => ({ DotField: () => null }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: { background: "#fff" } }) }));

const page = [{ key: "a", art: "guideWalk", title: "A", body: "a" }];
beforeEach(() => { state.entering = []; vi.resetModules(); });

// Android "Remove animations" left entering views at opacity 0: no sign-in panel, a blank consent screen.
it("mounts views without layout animations when the system reduces motion", async () => {
  state.reduced = true;
  const motion = await import("./motion");
  expect(motion.stillMotion).toBe(true);
  expect([motion.reveal, motion.enterSheet, motion.enterItem(2), motion.resize]).toEqual([undefined, undefined, undefined, undefined]);
  const { OnboardingShell } = await import("./onboarding-shell");
  const html = renderToStaticMarkup(h(OnboardingShell, { pages: page } as never, h("button", null, "Continue")));
  expect(html).toContain("Continue");
  expect(state.entering.every((entering) => entering === undefined)).toBe(true);
});

it("keeps the entering animations when motion is not reduced", async () => {
  state.reduced = false;
  const motion = await import("./motion");
  expect(motion.enterItem(0)).toBeDefined();
  const { OnboardingShell } = await import("./onboarding-shell");
  renderToStaticMarkup(h(OnboardingShell, { pages: page } as never, h("button", null, "Continue")));
  expect(state.entering.some((entering) => entering !== undefined)).toBe(true);
});
