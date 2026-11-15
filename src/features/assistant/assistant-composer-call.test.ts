// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  persist: vi.fn(async () => {}), send: vi.fn(async () => ({ kind: "settled" })),
  setDraft: vi.fn(), submit: undefined as undefined | (() => void),
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(async () => null), removeItem: vi.fn(async () => {}) } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "message-1" }));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("../workspace/use-local-draft", () => ({ useLocalDraft: () => ({ ready: true, value: { text: "Keep my draft", speechIds: [] }, valueRef: { current: { text: "Keep my draft", speechIds: [] } }, persist: mocks.persist, setValue: mocks.setDraft }) }));
vi.mock("./assistant-send", () => ({ assistantSendKey: () => "send-key", readStoredSend: async () => null, sendRoomMessage: mocks.send, checkRoomMessage: vi.fn() }));
vi.mock("./assistant-companion-state", () => ({ consumeAssistantSpeech: vi.fn(), useAssistantCompanion: (selector: (state: unknown) => unknown) => selector({ transcript: undefined }) }));
vi.mock("./assistant-voice-controls", () => ({ AssistantMicrophone: () => null, AssistantVoiceFeedback: () => null }));
vi.mock("@/ui/primitives", () => ({
  Button: () => null, Row: ({ children }: PropsWithChildren) => createElement("div", null, children), Notice: () => null,
  ErrorNotice: ({ error }: { error: unknown }) => error ? createElement("span", null, String(error)) : null,
}));
vi.mock("@/ui/chat-composer", () => ({ ChatComposer: ({ value, disabled, submit }: { value: string; disabled: boolean; submit: React.ReactNode }) => createElement("div", null, createElement("textarea", { defaultValue: value, disabled }), submit) }));
vi.mock("@/ui/chat-controls", () => ({ ChatCircleAction: ({ label, onPress, disabled }: { label: string; onPress(): void; disabled: boolean }) => { mocks.submit = onPress; return createElement("button", { onClick: onPress, disabled }, label); } }));

import { AssistantComposer } from "./assistant-composer";
import { useAssistantCall } from "./assistant-call-state";
import type { AssistantMobileClient } from "./assistant-client";
const props = { client: {} as AssistantMobileClient, machineId: "host-a", environmentId: "env-a", threadId: "thread-a", current: () => true, voiceCurrent: () => true, enabled: true, onSettled: async () => {} };

it("blocks text dispatch during a voice call while keeping the draft editable", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAssistantCall.setState({ phase: "listening" });
  mocks.send.mockClear(); mocks.setDraft.mockClear();
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantComposer, props)));
    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(container.querySelector("textarea")?.disabled).toBe(false);
    expect(container.querySelector("textarea")?.value).toBe("Keep my draft");
    await act(async () => mocks.submit!());
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.setDraft).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); useAssistantCall.setState({ phase: "idle" }); vi.unstubAllGlobals(); }
});

it("rechecks call ownership after draft persistence before text dispatch", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAssistantCall.setState({ phase: "idle" });
  mocks.send.mockClear(); mocks.setDraft.mockClear();
  mocks.persist.mockImplementationOnce(async () => { useAssistantCall.setState({ phase: "listening" }); });
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantComposer, props)));
    expect(container.querySelector("button")?.disabled).toBe(false);
    await act(async () => mocks.submit!());
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.setDraft).not.toHaveBeenCalled();
    expect(container.textContent).toContain("End the voice call first.");
    expect(container.querySelector("textarea")?.value).toBe("Keep my draft");
  } finally { await act(async () => root.unmount()); useAssistantCall.setState({ phase: "idle" }); vi.unstubAllGlobals(); }
});
