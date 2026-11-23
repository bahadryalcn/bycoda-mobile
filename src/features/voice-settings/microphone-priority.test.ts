// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { MicInput } from "./mic-input";
import type { VoicePreferences } from "./voice-preferences";
import { MicrophonePriority } from "./microphone-priority";

const fixture = vi.hoisted(() => ({
  inputs: [] as MicInput[],
  refresh: () => {},
  drag: (_: unknown, _move: { id: string; to: number }) => {},
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => children,
  AppState: { currentState: "active", addEventListener: (_: string, refresh: () => void) => {
    fixture.refresh = refresh;
    return { remove: fixture.remove };
  } },
}));
vi.mock("react-native-gesture-handler", () => ({ GestureHandlerRootView: ({ children }: PropsWithChildren) => children }));
vi.mock("panelui-native/components/sortable", () => ({
  Sortable: Object.assign(({ children, onReorder }: PropsWithChildren<{ onReorder: typeof fixture.drag }>) => {
    fixture.drag = onReorder;
    return children;
  }, {
    Item: ({ children }: PropsWithChildren) => children,
    Handle: ({ accessibilityLabel }: { accessibilityLabel: string }) => h("button", null, accessibilityLabel),
  }),
}));
vi.mock("../../../modules/bycoda-voice-companion", () => ({
  nativeVoiceCompanion: () => ({ listInputs: () => fixture.inputs }),
}));
vi.mock("./voice-preferences", () => ({ voicePreferences: { getState: () => ({ update: fixture.update }) } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: PropsWithChildren) => h("p", null, children),
  Stack: ({ children }: PropsWithChildren) => children,
  NavigationGroup: ({ children }: PropsWithChildren) => children,
  SectionHeader: ({ title }: { title: string }) => h("h2", null, title),
  ValueRow: ({ label }: { label: string }) => h("div", null, label),
}));

it("shows one attached mic without drag, then enables reordering after a second mic connects", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const micOrder = ["wired", "bluetooth", "builtin", "carplay"] satisfies VoicePreferences["micOrder"];
  const preferences: VoicePreferences = { engine: "local", speaker: "M1", speech: "supertonic", micOrder };
  fixture.inputs = [{ name: "Phone mic", type: "builtin", uid: "1" }];
  fixture.update.mockImplementation(async (patch: (current: VoicePreferences) => Partial<VoicePreferences>) =>
    Object.assign(preferences, patch(preferences)));
  try {
    await act(async () => root.render(h(MicrophonePriority, { order: micOrder, disabled: false })));
    expect(container.textContent).toBe("MicrophonePhone mic");
    expect(container.querySelectorAll("button")).toHaveLength(0);

    fixture.inputs = [...fixture.inputs, { name: "Headset mic", type: "bluetooth", uid: "2" }];
    await act(async () => fixture.refresh());
    expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Headset mic", "Phone mic"]);
    await act(async () => fixture.drag(undefined, { id: "builtin", to: 0 }));
    expect(preferences.micOrder).toEqual(["wired", "builtin", "bluetooth", "carplay"]);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
  expect(fixture.remove).toHaveBeenCalledOnce();
});
