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
  choose: (_kind: string) => {},
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: (_: string, refresh: () => void) => {
    fixture.refresh = refresh;
    return { remove: fixture.remove };
  } },
}));
vi.mock("../../../modules/bycoda-voice-companion", () => ({
  nativeVoiceCompanion: () => ({ listInputs: () => fixture.inputs }),
}));
vi.mock("./voice-preferences", () => ({ voicePreferences: { getState: () => ({ update: fixture.update }) } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({
  ValueRow: ({ label, value }: { label: string; value?: string }) => h("div", null, `${label}: ${value}`),
  SelectField: ({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string; detail?: string }[]; onChange(value: string): void }) => {
    fixture.choose = onChange;
    return h("div", null, `${label}: ${value}`, ...options.map((option) => h("button", { key: option.value }, [option.label, option.detail].filter(Boolean).join(" · "))));
  },
}));

// Owner decision: no drag reordering. One input is a value; two or more are a choice of which is used first.
it("shows one attached mic as a value, then offers the first-used choice after a second mic connects", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const micOrder = ["wired", "bluetooth", "builtin", "carplay"] satisfies VoicePreferences["micOrder"];
  const preferences = { micOrder } as unknown as VoicePreferences;
  // The simulator reports an identifier, never shown to the owner.
  fixture.inputs = [{ name: "MicrophoneBuiltIn", type: "builtin", uid: "1" }];
  fixture.update.mockImplementation(async (patch: (current: VoicePreferences) => Partial<VoicePreferences>) =>
    Object.assign(preferences, patch(preferences)));
  try {
    await act(async () => root.render(h(MicrophonePriority, { order: micOrder, disabled: false })));
    expect(container.textContent).toBe("Input device: Built-in");
    expect(container.querySelectorAll("button")).toHaveLength(0);

    fixture.inputs = [{ name: "iPhone Microphone", type: "builtin", uid: "1" }, { name: "Headset mic", type: "bluetooth", uid: "2" }];
    await act(async () => fixture.refresh());
    expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Bluetooth · Headset mic", "Built-in · iPhone Microphone"]);
    await act(async () => fixture.choose("builtin"));
    expect(preferences.micOrder).toEqual(["wired", "builtin", "bluetooth", "carplay"]);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
  expect(fixture.remove).toHaveBeenCalledOnce();
});
