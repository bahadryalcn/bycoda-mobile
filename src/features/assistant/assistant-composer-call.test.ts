// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  persist: vi.fn(async () => {}), send: vi.fn(async () => ({ kind: "settled" })),
  setDraft: vi.fn(), submit: undefined as undefined | (() => void),
  callSend: vi.fn(async (_text: string, _target: unknown) => {}),
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
vi.mock("./assistant-call-session", () => ({ sendAssistantCallText: mocks.callSend }));
vi.mock("./assistant-voice-controls", () => ({ AssistantMicrophone: () => null, AssistantVoiceFeedback: () => null }));
vi.mock("@/ui/primitives", () => ({
  Button: () => null, StatusLine: ({ label }: { label: string }) => createElement("output", null, label), Row: ({ children }: PropsWithChildren) => createElement("div", null, children), Notice: () => null,
  ErrorNotice: ({ error }: { error: unknown }) => error ? createElement("span", null, String(error)) : null,
}));
vi.mock("@/ui/chat-composer", () => ({ ChatComposer: ({ value, disabled, submit }: { value: string; disabled: boolean; submit: React.ReactNode }) => createElement("div", null, createElement("textarea", { defaultValue: value, disabled }), submit) }));
vi.mock("@/ui/chat-controls", () => ({ ChatCircleAction: ({ label, onPress, disabled }: { label: string; onPress(): void; disabled: boolean }) => { mocks.submit = onPress; return createElement("button", { onClick: onPress, disabled }, label); } }));

import { AssistantComposer } from "./assistant-composer";
import { useAssistantCall } from "./assistant-call-state";
import { AssistantCallError } from "./assistant-call-error";
import { HostWsError } from "@/remote/ws-connection";
import type { AssistantMobileClient } from "./assistant-client";
const props = { client: {} as AssistantMobileClient, machineId: "host-a", environmentId: "env-a", threadId: "thread-a", current: () => true, voiceCurrent: () => true, enabled: true, onSettled: async () => {} };

const deferred = () => { let resolve!: () => void, reject!: (error: unknown) => void; const promise = new Promise<void>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const callTarget = { machineId: "host-a", environmentId: "env-a", threadId: "thread-a" };

it("queues text typed during this conversation's call, shows it waiting, and clears the draft once sent", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAssistantCall.setState({ phase: "speaking", target: callTarget });
  mocks.send.mockClear(); mocks.setDraft.mockClear(); mocks.callSend.mockClear();
  const turn = deferred();
  mocks.callSend.mockImplementationOnce(() => { useAssistantCall.setState({ typed: "queued" }); return turn.promise; });
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantComposer, props)));
    expect(container.querySelector("button")?.disabled).toBe(false);
    await act(async () => mocks.submit!());
    expect(mocks.callSend).toHaveBeenCalledExactlyOnceWith("Keep my draft", callTarget);
    // Never a second, direct send beside the call's own turn.
    expect(mocks.send).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Queued: sends when the current turn ends.");
    expect(container.querySelector("textarea")?.disabled).toBe(true);
    expect(mocks.setDraft).not.toHaveBeenCalled();
    await act(async () => { useAssistantCall.setState({ typed: "sending" }); });
    expect(container.textContent).not.toContain("Queued");
    await act(async () => { useAssistantCall.setState({ typed: undefined }); turn.resolve(); });
    expect(mocks.setDraft).toHaveBeenCalledWith(null);
  } finally { await act(async () => root.unmount()); useAssistantCall.setState({ phase: "idle", target: undefined, typed: undefined }); vi.unstubAllGlobals(); }
});

it("keeps the draft when the call ends before the queued message's turn", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAssistantCall.setState({ phase: "listening", target: callTarget });
  mocks.send.mockClear(); mocks.setDraft.mockClear(); mocks.callSend.mockClear();
  mocks.callSend.mockRejectedValueOnce(new AssistantCallError("stopped"));
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantComposer, props)));
    await act(async () => mocks.submit!());
    expect(mocks.callSend).toHaveBeenCalledOnce();
    expect(mocks.setDraft).not.toHaveBeenCalled();
    expect(container.querySelector("textarea")?.value).toBe("Keep my draft");
    expect(container.querySelector("textarea")?.disabled).toBe(false);
    expect(container.querySelector("span")).toBeNull();
  } finally { await act(async () => root.unmount()); useAssistantCall.setState({ phase: "idle", target: undefined }); vi.unstubAllGlobals(); }
});

it("blocks text dispatch during a call in another conversation while keeping the draft editable", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAssistantCall.setState({ phase: "listening", target: { ...callTarget, threadId: "thread-b" } });
  mocks.send.mockClear(); mocks.setDraft.mockClear(); mocks.callSend.mockClear();
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantComposer, props)));
    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(container.querySelector("textarea")?.disabled).toBe(false);
    expect(container.querySelector("textarea")?.value).toBe("Keep my draft");
    await act(async () => mocks.submit!());
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.callSend).not.toHaveBeenCalled();
    expect(mocks.setDraft).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); useAssistantCall.setState({ phase: "idle", target: undefined }); vi.unstubAllGlobals(); }
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

it("shows why a computer-relayed call cannot take typed text and keeps the draft, without a direct send", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAssistantCall.setState({ phase: "speaking", target: callTarget });
  mocks.send.mockClear(); mocks.setDraft.mockClear(); mocks.callSend.mockClear();
  mocks.callSend.mockRejectedValueOnce(new HostWsError("unsupported"));
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantComposer, props)));
    await act(async () => mocks.submit!());
    expect(mocks.callSend).toHaveBeenCalledExactlyOnceWith("Keep my draft", callTarget);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.setDraft).not.toHaveBeenCalled();
    expect(container.querySelector("span")?.textContent).toContain("does not support");
    expect(container.querySelector("textarea")?.value).toBe("Keep my draft");
  } finally { await act(async () => root.unmount()); useAssistantCall.setState({ phase: "idle", target: undefined }); vi.unstubAllGlobals(); }
});
