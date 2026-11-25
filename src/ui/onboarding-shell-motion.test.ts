// @vitest-environment jsdom
import { act, createElement as h, useImperativeHandle, type PropsWithChildren, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

type LayoutEvent = { nativeEvent: { layout: { height: number } } };
const state = vi.hoisted(() => ({
  reduced: false,
  fontScale: 1,
  noticeClearance: 0,
  entering: [] as unknown[],
  scrollTo: vi.fn(),
  freeLayout: undefined as ((event: LayoutEvent) => void) | undefined,
}));
vi.mock("react-native", () => {
  const box = ({ children, pointerEvents, onLayout }: PropsWithChildren<{
    pointerEvents?: string;
    onLayout?: (event: LayoutEvent) => void;
  }>) => {
    if (pointerEvents === "box-none" && onLayout) state.freeLayout = onLayout;
    return h("div", null, children);
  };
  return { StyleSheet: { absoluteFill: {} }, View: box, ScrollView: box, useWindowDimensions: () => ({ width: 390, height: 844, fontScale: state.fontScale }) };
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
vi.mock("./onboarding-pager", () => ({
  OnboardingPager: ({ scrollRef }: { scrollRef: Ref<{ scrollTo: typeof state.scrollTo }> }) => {
    useImperativeHandle(scrollRef, () => ({ scrollTo: state.scrollTo }));
    return null;
  },
  PageDots: ({ index, onIndexChange }: { index: number; onIndexChange: (page: number) => void }) => h("nav", null,
    h("button", { onClick: () => onIndexChange(index - 1) }, "Previous"),
    h("output", null, index + 1),
    h("button", { onClick: () => onIndexChange(index + 1) }, "Next"),
  ),
}));
vi.mock("./dot-field", () => ({ DotField: () => null }));
vi.mock("./provider", () => ({ useActionableToastClearance: () => state.noticeClearance }));
vi.mock("./primitives", () => ({
  Heading: ({ children }: PropsWithChildren) => h("h2", null, children),
  Body: ({ children }: PropsWithChildren) => h("p", null, children),
}));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: { background: "#fff" } }) }));

const page = [{ key: "a", art: "guideWalk", title: "A", body: "a" }];
beforeEach(() => { state.entering = []; state.fontScale = 1; state.noticeClearance = 0; vi.resetModules(); });

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

it("keeps the measured top and action controls outside entering animations", async () => {
  state.reduced = false;
  const motion = await import("./motion");
  expect(motion.enterItem(0)).toBeDefined();
  const { OnboardingShell } = await import("./onboarding-shell");
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(h(OnboardingShell, {
    pages: page,
    top: h("button", null, "Back"),
  } as never, h("button", null, "Continue")));
  expect(state.entering.filter(Boolean)).toHaveLength(1);
  expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Back", "Continue"]);
  expect(container.querySelector("section button")).toBeNull();
});

it("gives a persistent notice and the sign-in action room at accessibility text sizes", async () => {
  state.fontScale = 1.5;
  state.noticeClearance = 160;
  const { OnboardingShell } = await import("./onboarding-shell");
  const html = renderToStaticMarkup(h(OnboardingShell, { pages: page } as never, h("button", null, "Continue")));
  expect(html).toContain("Continue");
  expect(html).not.toContain("<section");
});

it("moves the native pager with the buttons and stays inside the available pages", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { OnboardingShell } = await import("./onboarding-shell");
  const container = document.createElement("div");
  const root = createRoot(container);
  const click = (label: string) => act(() => {
    [...container.querySelectorAll("button")].find((button) => button.textContent === label)?.click();
  });
  state.scrollTo.mockClear();
  try {
    act(() => root.render(h(OnboardingShell, {
      pages: [...page, { key: "b", title: "B", art: "think" }],
    } as never)));
    click("Previous");
    click("Next");
    expect(container.querySelector("output")?.textContent).toBe("2");
    click("Next");
    click("Previous");
    expect(container.querySelector("output")?.textContent).toBe("1");
    expect(state.scrollTo.mock.calls).toEqual([[{ x: 390, animated: false }], [{ x: 0, animated: false }]]);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("keeps the tour text, page navigation and action available on short screens", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { OnboardingShell } = await import("./onboarding-shell");
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    act(() => root.render(h(OnboardingShell, {
      compactPages: true,
      pages: [...page, { key: "b", title: "B", body: "Second page description", art: "think" }],
    } as never, h("button", null, "Connect"))));
    act(() => state.freeLayout?.({ nativeEvent: { layout: { height: 100 } } }));
    expect(container.querySelector("h2")?.textContent).toBe("A");
    act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "Next")?.click());
    expect(container.querySelector("h2")?.textContent).toBe("B");
    expect(container.querySelector("p")?.textContent).toBe("Second page description");
    expect(container.textContent).toContain("Connect");
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
