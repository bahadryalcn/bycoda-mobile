// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { TranscriptBlock } from "./transcript-block";
import type { Block } from "./wire";
import type { TranscriptBlockProps } from "./session-types";
import type { QueryLike } from "@/ui/query-presentation";

const detail = vi.hoisted(() => ({ query: {} as QueryLike, enabled: false, refetch: vi.fn() }));

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
  return { Badge: () => null, Body: Container,
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => h("button", { onClick: onPress }, label),
    CodePanel: Container, CodeText: Container, Row: Container,
    QueryState: ({ query }: { query: QueryLike }) => query.error
      ? h("button", { onClick: () => query.refetch?.() }, query.data ? "Refresh" : "Retry") : null,
    Sheet: ({ visible, title, children }: PropsWithChildren<{ visible: boolean; title?: string }>) => visible ? h("section", { "aria-label": title }, children) : null };
});
vi.mock("@/ui/chat-controls", () => ({ ChatAction: () => null, ChatSummary: () => h("button", null, "Open details") }));
vi.mock("@/ui/chat", () => ({ ChatMessage: ({ children }: PropsWithChildren) => h("article", null, children), chatUserBubbleStyle: () => ({}) }));
vi.mock("@/ui/chat-activity", () => ({
  ChatActivity: ({ title, onInspect }: { title: string; onInspect: () => void }) =>
    h("button", { onClick: onInspect }, title),
  ChatPlan: () => null,
  ChatStreaming: () => null,
}));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => h("p", null, text) }));
vi.mock("@/ui/message-code", () => ({ MessageCode: ({ code }: { code: string }) => h("pre", { "data-reader": true }, code) }));
vi.mock("./activity-inspector-approval", () => ({ ActivityApproval: () => h("div", { "data-approval": true }, "Guarded approval") }));
vi.mock("@/ui/chat-styles", () => ({ useChatTextStyles: () => ({}) }));
vi.mock("@/state/chat-appearance", () => ({ useChatAppearance: () => "standard" }));
vi.mock("@/ui/tokens", () => ({ radii: {}, space: {} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/error-message", () => ({ friendlyProviderFailure: (text: string) => text, errorMessage: String }));
vi.mock("@/ui/toast", () => ({ showToast: () => undefined }));
vi.mock("./user-turn-notice", () => ({ PENDING_SWEEP_MS: 10_000, UserTurnNotice: () => null, PendingUserMessage: ({ text }: { text: string }) => h("p", null, text) }));
vi.mock("lucide-react-native/icons/copy", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("@/ui/feedback", () => ({ TextAction: ({ label, onPress }: { label: string; onPress: () => void }) => h("button", { onClick: onPress }, label) }));
vi.mock("@/ui/use-clipboard-feedback", () => ({ useClipboardFeedback: () => ({ copy: () => {}, busy: false, copied: false }) }));
vi.mock("./system-failure-card", () => ({ isCompactSystemNotice: () => false, SystemNoticeRow: () => null }));
vi.mock("./session-queries", () => ({ useSessionBlock: ({ enabled }: { enabled: boolean }) => {
  detail.enabled = enabled;
  return detail.query;
} }));
vi.mock("./transcript-attachments", () => {
  const list = ({ block }: { block: Block }) => h("div", { "data-attachments": block.role === "user" ? "above" : "inside" }, block.image?.name, ...block.attachments?.map(file => file.name) ?? []);
  return {
    TranscriptAttachments: ({ block }: { block: Block }) => block.role === "user" ? null : list({ block }),
    UserMessageAttachments: list,
    UserMediaColumn: ({ children }: PropsWithChildren) => children,
    hasUserMessageAttachments: (block: Block) => block.role === "user" && (!!block.image || !!block.attachments?.length),
  };
});
vi.mock("./transcript-structured", () => ({ TranscriptStructured: () => null }));
vi.mock("./transcript-actions", () => ({ TranscriptActions: () => null }));
vi.mock("./selected-text", () => ({ MessageSelection: ({ children }: PropsWithChildren) => children }));
vi.mock("@/ui/message-selection", () => ({ SelectableProse: ({ children }: PropsWithChildren) => children }));
vi.mock("./session-artifacts", () => ({ SessionArtifacts: () => null }));
vi.mock("@/ui/agent-avatar", () => ({ AgentAvatar: () => null }));
vi.mock("@/features/management/plans/plan-review", () => ({ PlanReview: () => null }));
vi.mock("./transcript-subagents", () => ({ TranscriptSubagents: () => null }));
vi.mock("./orchestration-details", () => ({
  OrchestrationDetails: ({ block }: { block: Block }) => h("p", null, block.orchestration?.title ?? "Proposal unavailable"),
}));

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); detail.query = {}; detail.enabled = false; detail.refetch.mockClear(); vi.unstubAllGlobals(); });
for (const role of ["user", "assistant", "image", "tool"] as const) {
  it(`keeps ${role} attachments visible without opening an activity sheet`, () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    root = createRoot(container);
    const block: Block = { id: "media", role, text: "", image: { name: "diagram.png", mimeType: "image/png", size: 1024 } as Block["image"] };
    act(() => root!.render(h(TranscriptBlock, { block, scope: { machineId: "m", sessionId: "s" }, getRevision: () => undefined, disabled: false, onCommand: vi.fn() } as TranscriptBlockProps)));
    expect(container.querySelector("[data-attachments]")?.textContent).toContain("diagram.png");
    expect(container.querySelector("section")).toBeNull();
    // A user's files sit above the bubble, never inside it.
    if (role === "user") expect(container.querySelector("[data-attachments]")?.getAttribute("data-attachments")).toBe("above");
    // An attachment-only message has no empty bubble.
    if (role === "user") expect(container.querySelector("article")).toBeNull();
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

it("shows the action name in the tool card and its detail sheet", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  const block: Block = {
    id: "tool",
    role: "tool",
    text: "",
    tool: { kind: "mcp", title: "mcp__workspace-tools__delegate_task" },
  };
  act(() =>
    root!.render(h(TranscriptBlock, {
      block,
      scope: { machineId: "m", sessionId: "s" },
      getRevision: () => undefined,
      disabled: false,
      onCommand: vi.fn(),
    })),
  );
  const card = container.querySelector("button");
  expect(card?.textContent).toBe("delegate task");
  act(() => card?.click());
  expect(container.querySelector("section")?.getAttribute("aria-label")).toBe("delegate task");
});

it("gives expanded remote activity one retry and retains the last full text after a refresh failure", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  const block: Block = { id: "tool", role: "tool", text: "preview", remoteContent: { revision: 1, bytes: 100 } };
  const render = (activityDetail: boolean) => act(() => root!.render(h(TranscriptBlock, {
    block, scope: { machineId: "m", sessionId: "s" }, getRevision: () => undefined,
    disabled: false, onCommand: vi.fn(), activityDetail,
  } as TranscriptBlockProps)));
  const buttons = () => [...container.querySelectorAll("button")];
  detail.query = { error: new Error("Read failed"), refetch: detail.refetch };
  render(false);
  expect(detail.enabled).toBe(false);
  expect(buttons().map((button) => button.textContent)).not.toContain("Retry");
  render(true);
  expect(detail.enabled).toBe(true);
  expect(buttons().map((button) => button.textContent)).toEqual(["Retry"]);
  act(() => buttons()[0]?.click());
  expect(detail.refetch).toHaveBeenCalledOnce();
  detail.query = { ...detail.query, data: { id: "tool", role: "tool", text: "full output" } };
  render(true);
  expect(container.querySelector("[data-reader]")?.textContent).toBe("full output");
  expect(buttons().map((button) => button.textContent)).toEqual(["Refresh"]);
});

it("keeps the proposal sheet mounted without replacing it when the reviewed record disappears", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  const block: Block = { id: "proposal", role: "tool", text: "", orchestration: {
    version: 1, leadId: "s", title: "Reviewed proposal", cwd: "/reviewed", checkoutCwd: "/reviewed", status: "ready",
    request: "Review the work", summary: "Review workspace changes", author: { harness: "claude", model: "model", name: "Model" },
    settings: { maxWorkers: 1, choices: [] }, tasks: [],
  } };
  const render = (value: Block) => act(() => root!.render(h(TranscriptBlock, {
    block: value, scope: { machineId: "m", sessionId: "s" }, getRevision: () => 1, disabled: false,
    onCommand: vi.fn(), activityDetail: true,
  })));
  render(block);
  act(() => [...container.querySelectorAll("button")].find((button) => button.textContent === "Coordination details")!.click());
  expect(container.querySelector("section")?.textContent).toContain("Reviewed proposal");
  render({ ...block, orchestration: undefined });
  expect(container.querySelector("section")?.textContent).toContain("Proposal unavailable");
  render({ ...block, orchestration: { ...block.orchestration!, cwd: "/different", title: "Different proposal" } });
  expect(container.querySelector("section")?.textContent).toContain("Proposal unavailable");
  expect(container.querySelector("section")?.getAttribute("aria-label")).toBe("Coordination details");
  render(block);
  expect(container.querySelector("section")?.textContent).toContain("Reviewed proposal");
});

it("does not repeat generic text beside authoritative question answers", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  const block = { id: "answer", role: "user", text: "duplicate answer", questionAnswers: [{ prompt: "Choose", answers: ["A"] }] } as unknown as Block;
  act(() => root!.render(h(TranscriptBlock, { block, scope: { machineId: "m", sessionId: "s" }, getRevision: () => undefined, disabled: false, onCommand: vi.fn() } as TranscriptBlockProps)));
  expect(container.textContent).not.toContain("duplicate answer");
});
