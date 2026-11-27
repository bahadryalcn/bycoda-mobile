// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ComposerDictationNotice } from "./composer-recording";

type Action = { label: string; onPress(): void };
const state = vi.hoisted(() => ({
  lines: [] as { tone?: string; label: string; action?: Action }[],
  actions: [] as Action[],
  openSettings: vi.fn(async () => {}),
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: unknown }) => children,
  Text: ({ children }: { children?: unknown }) => children,
  Linking: { openSettings: state.openSettings },
}));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));
vi.mock("@/ui/chat-controls", () => ({ ChatCircleAction: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { accent: "accent" } }) }));
vi.mock("@/ui/use-reduced-motion", () => ({ useReducedMotionPreference: () => false }));
vi.mock("@/ui/feedback", () => ({
  StatusLine: (props: { tone?: string; label: string; action?: Action }) => { state.lines.push(props); return null; },
  TextAction: (props: Action) => { state.actions.push(props); return null; },
}));
vi.mock("../voice-settings/microphone-permission-notice", () => ({ isMicrophoneDenied: (error: unknown) => (error as { denied?: boolean })?.denied === true }));
vi.mock("../voice-settings/voice-preferences", () => ({ useVoicePreferences: () => ({ preferences: { phoneDictation: false } }) }));
vi.mock("./composer-dictation", () => ({ DictationLevelMeter: () => null, dictationErrorMessage: () => "Voice didn't work. Try again." }));

let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
});
afterEach(() => {
  act(() => root.unmount());
  state.lines = []; state.actions = []; state.openSettings.mockClear();
  vi.unstubAllGlobals();
});
const render = (error: unknown, clearError = vi.fn()) => {
  act(() => root.render(createElement(ComposerDictationNotice, { dictation: { error, clearError } as never })));
  return clearError;
};

it("shows a failure as one dismissible line", () => {
  const clear = render(new Error("boom"));
  expect(state.lines).toHaveLength(1);
  expect(state.lines[0]).toMatchObject({ tone: "danger", label: "Voice didn't work. Try again.", action: { label: "Dismiss" } });
  act(() => state.lines[0]!.action!.onPress());
  expect(clear).toHaveBeenCalledOnce();
});

it("keeps a permanent microphone denial compact, with Open Settings and Dismiss", () => {
  const clear = render({ denied: true });
  expect(state.lines[0]).toMatchObject({ tone: "warning", label: "Microphone access is off. Allow it for bycoda in Settings.", action: { label: "Open Settings" } });
  act(() => state.lines[0]!.action!.onPress());
  expect(state.openSettings).toHaveBeenCalledOnce();
  expect(state.actions.map((action) => action.label)).toEqual(["Dismiss"]);
  act(() => state.actions[0]!.onPress());
  expect(clear).toHaveBeenCalledOnce();
});

it("renders nothing without an error", () => {
  render(null);
  expect(state.lines).toHaveLength(0);
  expect(state.actions).toHaveLength(0);
});
