// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(async () => null), removeItem: vi.fn(async () => {}) } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "message-1" }));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("../workspace/use-local-draft", () => ({ useLocalDraft: () => ({ ready: true, value: { text: "", speechIds: [] }, valueRef: { current: { text: "", speechIds: [] } }, persist: async () => {}, setValue: () => {} }) }));
vi.mock("./assistant-send", () => ({
  assistantSendKey: () => "send-key",
  readStoredSend: async () => ({ text: "Türkiye'nin başkenti neresi?" }),
  sendRoomMessage: vi.fn(),
  checkRoomMessage: mocks.check,
}));
vi.mock("./assistant-companion-state", () => ({ consumeAssistantSpeech: vi.fn(), useAssistantCompanion: (selector: (state: unknown) => unknown) => selector({ transcript: undefined }) }));
vi.mock("./assistant-call-session", () => ({ sendAssistantCallText: vi.fn() }));
vi.mock("./assistant-voice-controls", () => ({ AssistantMicrophone: () => null, AssistantVoiceFeedback: () => null }));
vi.mock("@/ui/primitives", () => ({
  Button: ({ label, onPress }: { label: string; onPress(): void }) => createElement("button", { "aria-label": label, onClick: onPress }, label),
  Row: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Notice: ({ message, children }: PropsWithChildren<{ message: string }>) => createElement("p", null, message, children),
  ErrorNotice: ({ error }: { error: unknown }) => error ? createElement("strong", null, String(error)) : null,
}));
vi.mock("@/ui/chat-composer", () => ({ ChatComposer: () => null }));
vi.mock("@/ui/chat-controls", () => ({ ChatCircleAction: () => null }));

import { AssistantComposer } from "./assistant-composer";
import { RemoteHostError } from "@/remote/host-error";
import type { AssistantMobileClient } from "./assistant-client";
const props = { client: {} as AssistantMobileClient, machineId: "host-a", environmentId: "env-a", threadId: "thread-a", current: () => true, voiceCurrent: () => true, enabled: true, onSettled: async () => {} };

// After the QA Host restarted, "Check status" answered "connection interrupted, check the result" forever.
it("explains a restarted computer instead of failing the status check, and keeps the message tracked", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.check.mockRejectedValueOnce(new RemoteHostError("host-a", "host", "The computer rejected this request. Check its details and try again.", false, false, "CONTEXT_CHANGED"));
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantComposer, props)));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Check status"]')!.click());
    expect(container.textContent).toContain("The computer restarted, so this message's result can no longer be confirmed.");
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector('[aria-label="Stop waiting"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
