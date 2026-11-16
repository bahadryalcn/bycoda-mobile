// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TranscriptBlock } from "./transcript-block";
import type { Block } from "./wire";
import type { TranscriptBlockProps } from "./session-types";

vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children), StyleSheet: { hairlineWidth: 1 } }));
vi.mock("panelui-native/components/collapsible", () => ({
  Collapsible: Object.assign(({ children }: PropsWithChildren) => h("div", null, children), {
    Trigger: ({ children }: PropsWithChildren) => h("button", null, children),
    Content: ({ children }: PropsWithChildren) => h("div", null, children),
    Indicator: () => null,
  }),
}));
vi.mock("lucide-react-native/icons/ellipsis", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/terminal", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/list-checks", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pencil", () => ({ default: () => null }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/primitives", () => {
  const Container = ({ children }: PropsWithChildren) => h("div", null, children);
  return { Badge: () => null, Body: Container, Button: () => null, CodePanel: Container, CodeText: Container, QueryState: () => null, Row: Container,
    Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) => visible ? h("section", null, children) : null };
});
vi.mock("@/ui/chat-controls", () => ({ ChatAction: () => null, ChatSummary: () => h("button", null, "Open details") }));
vi.mock("@/ui/chat", () => ({ ChatMessage: ({ children }: PropsWithChildren) => h("article", null, children), chatUserBubbleStyle: () => ({}) }));
vi.mock("@/ui/chat-activity", () => ({ ChatActivity: () => h("button", null, "Open activity"), ChatPlan: () => null, ChatStreaming: () => null }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => h("p", null, text) }));
vi.mock("@/ui/message-code", () => ({ MessageCode: ({ code }: { code: string }) => h("pre", { "data-reader": true }, code) }));
vi.mock("./activity-inspector-approval", () => ({ ActivityApproval: () => h("div", { "data-approval": true }, "Guarded approval") }));
vi.mock("@/ui/chat-styles", () => ({ useChatTextStyles: () => ({}) }));
vi.mock("@/state/chat-appearance", () => ({ useChatAppearance: () => "standard" }));
vi.mock("@/ui/tokens", () => ({ radii: {}, space: {} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/error-message", () => ({ friendlyProviderFailure: (text: string) => text }));
vi.mock("./user-turn-notice", () => ({ UserTurnNotice: () => null }));
vi.mock("./session-queries", () => ({ useSessionBlock: () => ({}) }));
vi.mock("./transcript-attachments", () => ({ TranscriptAttachments: ({ block }: { block: Block }) => h("div", { "data-attachments": true }, block.image?.name, ...block.attachments?.map(file => file.name) ?? []) }));
vi.mock("./transcript-structured", () => ({ TranscriptStructured: () => null }));
vi.mock("./transcript-actions", () => ({ TranscriptActions: () => null }));
vi.mock("./session-artifacts", () => ({ SessionArtifacts: () => null }));
vi.mock("@/ui/agent-avatar", () => ({ AgentAvatar: () => null }));
vi.mock("@/features/management/plans/plan-review", () => ({ PlanReview: () => null }));
vi.mock("./subagent-card", () => ({ SubagentCard: () => null }));
vi.mock("./orchestration-details", () => ({ OrchestrationDetails: () => null }));

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); vi.unstubAllGlobals(); });
for (const role of ["user", "assistant", "image", "tool"] as const) {
  it(`keeps ${role} attachments visible without opening an activity sheet`, () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    root = createRoot(container);
    const block: Block = { id: "media", role, text: "", image: { name: "diagram.png", mimeType: "image/png", size: 1024 } as Block["image"] };
    act(() => root!.render(h(TranscriptBlock, { block, scope: { machineId: "m", sessionId: "s" }, getRevision: () => undefined, disabled: false, onCommand: vi.fn() } as TranscriptBlockProps)));
    expect(container.querySelector("[data-attachments]")?.textContent).toContain("diagram.png");
    expect(container.querySelector("section")).toBeNull();
  });
}

it("mounts guarded approval and bounded raw output readers in activity details", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  const block = { id: "approval", role: "tool", text: "command output", approval: { requestId: 1 } } as Block;
  act(() => root!.render(h(TranscriptBlock, { block, scope: { machineId: "m", sessionId: "s" }, getRevision: () => undefined, disabled: false, onCommand: vi.fn(), activityDetail: true } as TranscriptBlockProps)));
  expect(container.querySelector("[data-approval]")).not.toBeNull();
  expect(container.querySelector("[data-reader]")?.textContent).toBe("command output");
});

it("does not repeat generic text beside authoritative question answers", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  const block = { id: "answer", role: "user", text: "duplicate answer", questionAnswers: [{ prompt: "Choose", answers: ["A"] }] } as unknown as Block;
  act(() => root!.render(h(TranscriptBlock, { block, scope: { machineId: "m", sessionId: "s" }, getRevision: () => undefined, disabled: false, onCommand: vi.fn() } as TranscriptBlockProps)));
  expect(container.textContent).not.toContain("duplicate answer");
});
