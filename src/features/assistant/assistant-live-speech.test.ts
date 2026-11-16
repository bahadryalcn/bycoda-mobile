// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("@/ui/primitives", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children) }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => h("p", null, text) }));
vi.mock("@/ui/chat", () => ({ chatUserBubbleStyle: () => ({}) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
import { AssistantLiveSpeech } from "./assistant-live-speech";
import { useAssistantCall } from "./assistant-call-state";
it("shows recognized speech immediately only in its authorized conversation while awaiting a reply", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  const target = { machineId: "host", environmentId: "env", threadId: "room" };
  try {
    useAssistantCall.setState({ phase: "sending", target, utterance: "Recognized words" });
    await act(async () => root.render(h(AssistantLiveSpeech, { target })));
    expect(container.textContent).toContain("Recognized words");
    await act(async () => root.render(h(AssistantLiveSpeech, { target: { ...target, environmentId: "replacement" } })));
    expect(container.textContent).toBe("");
    await act(async () => root.render(h(AssistantLiveSpeech)));
    expect(container.textContent).toBe("");
    await act(async () => { useAssistantCall.setState({ phase: "speaking" }); root.render(h(AssistantLiveSpeech, { target })); });
    expect(container.textContent).toBe("");
  } finally { await act(async () => root.unmount()); useAssistantCall.setState({ phase: "idle", utterance: undefined, target: undefined }); vi.unstubAllGlobals(); }
});
