// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const voice = vi.hoisted(() => ({ phase: "idle", error: null as unknown }));
vi.mock("react-native", () => ({ View: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel?: string }>) => createElement("div", { "aria-live": "polite", "aria-label": accessibilityLabel }, children) }));
vi.mock("@/ui/feedback", () => ({ StatusLine: ({ label, tone, action }: { label: string; tone?: string; action?: { label: string; onPress(): void } }) =>
  createElement("p", { "data-tone": tone }, label, action ? createElement("button", { onClick: action.onPress }, action.label) : null) }));
vi.mock("lucide-react-native/icons/mic", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/volume-2", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/chat-controls", () => ({ ChatCircleAction: ({ label, disabled }: { label: string; disabled: boolean }) => createElement("button", { disabled }, label) }));
vi.mock("./assistant-companion-state", () => ({ useAssistantCompanion: Object.assign((selector: (value: unknown) => unknown) => selector({ voice: voice.phase, error: voice.error }),
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
    expect(container.textContent).toContain("Voice is unavailable. Check microphone permission and voice setup on your computer.");
    expect(container.textContent).not.toContain("G:/Models");
    voice.error = new Error("Speech could not be recognized. Try again.");
    await act(async () => root.render(createElement(AssistantVoiceFeedback)));
    expect(container.textContent).toContain("Speech could not be recognized. Try again.");
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  } finally { voice.error = null; await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("shows recording as one status line while retaining review and duration guidance for accessibility", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  voice.phase = "recording";
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantVoiceFeedback)));
    expect(container.textContent).toBe("Listening (up to 30 seconds)");
    expect(container.querySelector("[aria-label]")?.getAttribute("aria-label")).toContain("review and send the text");
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
    expect([...container.querySelectorAll("button")].map(button => [button.textContent, button.disabled])).toEqual([["Dictate message", true], ["Read reply aloud", true]]);
  } finally { await act(async () => root.unmount()); useAssistantCall.setState({ phase: "idle" }); vi.unstubAllGlobals(); }
});
