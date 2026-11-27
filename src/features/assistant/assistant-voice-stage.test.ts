import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ StyleSheet: { absoluteFill: {} }, View: () => null, useWindowDimensions: () => ({ width: 390, height: 844 }) }));
vi.mock("react-native-svg", () => ({ default: () => null, Circle: () => null, Defs: () => null, RadialGradient: () => null, Stop: () => null }));
vi.mock("react-native-reanimated", () => ({ default: { View: () => null }, cancelAnimation: vi.fn(), Easing: {}, useAnimatedStyle: vi.fn(), useSharedValue: vi.fn(), withRepeat: vi.fn(), withTiming: vi.fn() }));
vi.mock("panelui-native/components/thinking-orb", () => ({ ThinkingOrb: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: vi.fn() }));
vi.mock("@/ui/use-reduced-motion", () => ({ useReducedMotionPreference: () => false }));
vi.mock("@/ui/use-owner-visible", () => ({ useOwnerVisible: () => true }));
import { assistantStageOrb } from "./assistant-voice-stage";

it("holds the idle home orb still: no decorative loop runs while nothing happens", () => {
  expect(assistantStageOrb("idle").paused).toBe(true);
  for (const state of ["listening", "muted", "thinking", "speaking"] as const)
    expect(assistantStageOrb(state).paused).toBe(false);
});

it("holds a stopped call still", () => {
  expect(assistantStageOrb("error").paused).toBe(true);
});
