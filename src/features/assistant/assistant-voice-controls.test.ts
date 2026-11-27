// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const voice = vi.hoisted(() => ({ phase: "idle", error: null as unknown }));
vi.mock("react-native", () => ({
  View: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel?: string }>) => createElement("div", { "aria-label": accessibilityLabel }, children),
  Text: ({ children, accessibilityLabel, accessibilityLiveRegion }: PropsWithChildren<{ accessibilityLabel?: string; accessibilityLiveRegion?: string }>) =>
    createElement("span", { "aria-label": accessibilityLabel, "aria-live": accessibilityLiveRegion }, children),
}));
vi.mock("@/ui/feedback", () => ({ StatusLine: ({ label, tone, action }: { label: string; tone?: string; action?: { label: string; onPress(): void } }) =>
  createElement("p", { "data-tone": tone, "aria-live": "polite" }, label, action ? createElement("button", { onClick: action.onPress }, action.label) : null) }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/ui/toast", () => ({ showToast: toast }));
vi.mock("lucide-react-native/icons/mic", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/volume-2", () => ({ default: () => null }));
vi.mock("../voice-settings/voice-preferences", () => ({ useVoicePreferences: () => ({ preferences: { phoneDictation: false } }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, semanticColors: { info: { text: "info" } }, uiStyles: {} }) }));
vi.mock("@/ui/chat-controls", () => ({ ChatCircleAction: ({ label, disabled, onPress }: { label: string; disabled: boolean; onPress(): void }) => createElement("button", { disabled, onClick: onPress }, label) }));
const level = vi.hoisted(() => ({ value: 0, listeners: new Set<() => void>() }));
const partial = vi.hoisted(() => ({ text: "", listeners: new Set<() => void>(), set(text: string) { this.text = text; this.listeners.forEach(listener => listener()); } }));
vi.mock("./assistant-companion-state", () => ({
  assistantDictationLevel: { get: () => level.value, set: (value: number) => { level.value = value; level.listeners.forEach(listener => listener()); },
    subscribe: (listener: () => void) => { level.listeners.add(listener); return () => level.listeners.delete(listener); } },
  assistantDictationPartial: { get: () => partial.text,
    subscribe: (listener: () => void) => { partial.listeners.add(listener); return () => partial.listeners.delete(listener); } },
  useAssistantCompanion: Object.assign((selector: (value: unknown) => unknown) => selector({ voice: voice.phase, error: voice.error }),
  { setState: (patch: { error?: unknown }) => { voice.error = patch.error ?? null; } }) }));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel?: string }>) => createElement("span", { "aria-label": accessibilityLabel }, children),
  Disclosure: ({ children, label, detail, tone }: PropsWithChildren<{ label: string; detail: string; tone: string }>) => createElement("details", { "data-tone": tone }, createElement("summary", null, label, " ", detail), children),
  IconButton: ({ label, disabled }: { label: string; disabled: boolean }) => createElement("button", { disabled }, label),
}));
import { AssistantMicrophone, AssistantReadAloud, AssistantVoiceFeedback } from "./assistant-voice-controls";
import { useAssistantCall } from "./assistant-call-state";

// The owner read raw English sentences in a box above the composer.
it("shows a voice failure as one localized line with Dismiss, never the raw English message", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  voice.error = new Error("Local speech recognizer could not load G:/Models/whisper/ggml.bin.");
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantVoiceFeedback)));
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("p")?.dataset.tone).toBe("danger");
    expect(container.textContent).toContain("Voice didn't work. Try again.");
    expect(container.textContent).not.toContain("G:/Models");
    voice.error = new Error("Speech could not be recognized. Try again.");
    await act(async () => root.render(createElement(AssistantVoiceFeedback)));
    expect(container.textContent).toContain("Speech could not be recognized. Try again.");
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  } finally { voice.error = null; await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("shows recording as the shared line: listening, a live level and the time against the real limit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  voice.phase = "recording";
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantVoiceFeedback)));
    expect(container.textContent).toBe("Listening0:00 / 0:22");
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("Listening");
    expect(container.querySelector('[aria-label^="Up to"]')).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(12_100); });
    expect(container.textContent).toBe("Listening0:12 / 0:22");
    // The recorder stops at the limit; the clock never runs past it.
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(container.textContent).toBe("Listening0:22 / 0:22");
    voice.phase = "transcribing";
    await act(async () => root.render(createElement(AssistantVoiceFeedback)));
    expect(container.textContent).toBe("Transcribing");
  } finally { voice.phase = "idle"; await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); }
});

it("previews the phone recognizer's words under the status line until the final text is inserted", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  voice.phase = "recording";
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantVoiceFeedback)));
    expect(container.textContent).toBe("Listening0:00 / 0:22");
    await act(async () => { partial.set("hello"); });
    expect(container.textContent).toBe("Listening0:00 / 0:22hello");
    await act(async () => { partial.set("hello world"); });
    expect(container.textContent).toBe("Listening0:00 / 0:22hello world");
    // Announced once as Listening; the changing words are not a live region.
    expect([...container.querySelectorAll("[aria-live]")].map(node => node.textContent)).toEqual(["Listening"]);
    voice.phase = "transcribing";
    await act(async () => root.render(createElement(AssistantVoiceFeedback)));
    expect(container.textContent).toBe("Transcribinghello world");
    // The recognizer clears the preview right before the final text reaches the draft, so it never shows twice.
    await act(async () => { partial.set(""); });
    expect(container.textContent).toBe("Transcribing");
  } finally { partial.set(""); voice.phase = "idle"; await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); }
});

it("offers one Stop: the composer toggle becomes Finish recording while recording", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  voice.phase = "recording";
  const container = document.createElement("div"), root = createRoot(container);
  const target = { machineId: "host-a", environmentId: "env-a", threadId: "thread-a" };
  try {
    await act(async () => root.render(createElement("div", null,
      createElement(AssistantVoiceFeedback),
      createElement(AssistantMicrophone, { target, enabled: true, current: () => true }))));
    expect([...container.querySelectorAll("button")].map(button => [button.textContent, button.disabled])).toEqual([["Finish recording", false]]);
  } finally { voice.phase = "idle"; await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("disables new dictation and read-aloud while a hands-free call owns voice", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAssistantCall.setState({ phase: "listening" });
  const container = document.createElement("div"), root = createRoot(container);
  const target = { machineId: "host-a", environmentId: "env-a", threadId: "thread-a" };
  try {
    await act(async () => root.render(createElement("div", null,
      createElement(AssistantMicrophone, { target, enabled: true, current: () => true }),
      createElement(AssistantReadAloud, { target, text: "A readable reply", enabled: true, current: () => true }))));
    // The blocked microphone stays tappable only to say why; read-aloud is disabled.
    expect([...container.querySelectorAll("button")].map(button => [button.textContent, button.disabled])).toEqual([["A voice call or recording is in progress", false], ["Read reply aloud", true]]);
    await act(async () => container.querySelector("button")!.click());
    expect(toast).toHaveBeenCalledWith({ tone: "info", message: "A voice call or recording is in progress" });
  } finally { await act(async () => root.unmount()); useAssistantCall.setState({ phase: "idle" }); vi.unstubAllGlobals(); }
});
