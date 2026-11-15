// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const voice = vi.hoisted(() => ({ phase: "idle", error: null as unknown }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", { "aria-live": "polite" }, children) }));
vi.mock("lucide-react-native/icons/mic", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/volume-2", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/chat-controls", () => ({ ChatCircleAction: ({ label, disabled }: { label: string; disabled: boolean }) => createElement("button", { disabled }, label) }));
vi.mock("./assistant-companion-state", () => ({ useAssistantCompanion: (selector: (value: unknown) => unknown) => selector({ voice: voice.phase, error: voice.error }) }));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel?: string }>) => createElement("span", { "aria-label": accessibilityLabel }, children),
  Disclosure: ({ children, label, detail, tone }: PropsWithChildren<{ label: string; detail: string; tone: string }>) => createElement("details", { "data-tone": tone }, createElement("summary", null, label, " ", detail), children),
  IconButton: ({ label, disabled }: { label: string; disabled: boolean }) => createElement("button", { disabled }, label),
}));
import { AssistantMicrophone, AssistantReadAloud, AssistantVoiceFeedback } from "./assistant-voice-controls";
import { useAssistantCall } from "./assistant-call-state";

it("keeps recovery instructions and full voice error in compact disclosure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  voice.error = new Error("Local speech recognizer could not load G:/Models/whisper/large-v3-turbo/ggml-large-v3-turbo-q5_0.bin. The computer is connected, but this model file is unavailable. Microphone permission on the phone is granted; open local voice settings on the computer and choose an installed speech model.");
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantVoiceFeedback)));
    const detail = container.querySelector("details")!;
    expect(detail.open).toBe(false);
    expect(detail.dataset.tone).toBe("warning");
    expect(detail.querySelector("summary")?.textContent).toContain("Check microphone permission and voice setup on your computer.");
    expect(detail.textContent).toContain((voice.error as Error).message);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  } finally { voice.error = null; await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("shows short recording status while retaining full review and duration guidance for accessibility", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  voice.phase = "recording";
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantVoiceFeedback)));
    expect(container.textContent).toBe("Listening (up to 30 seconds)");
    expect(container.querySelector("span")?.getAttribute("aria-label")).toContain("review and send the text");
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
