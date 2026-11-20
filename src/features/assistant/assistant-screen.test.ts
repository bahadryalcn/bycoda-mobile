// @vitest-environment happy-dom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const review = vi.hoisted(() => ({ approvals: 0 }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() }, Stack: { Screen: () => null } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { muted: "muted" }, uiStyles: { grow: {}, caption: {}, heading: {} } }) }));
vi.mock("./assistant-call-controls", () => ({ AssistantCallButton: () => createElement("button", { "data-call": true }, "Voice call"), AssistantCallError: () => null }));
vi.mock("./assistant-call-session", () => ({ endAssistantCall: vi.fn() }));
vi.mock("./assistant-home-hero", () => ({
  AssistantContextBadges: ({ machineName, scope }: { machineName: string; scope: string }) => createElement("span", null, `${machineName} ${scope}`),
  AssistantHomeHero: ({ name, machineName, onOpen, onVoice, openDisabled, voiceDisabled }: { name: string; machineName: string; onOpen(): void; onVoice(): void; openDisabled: boolean; voiceDisabled: boolean }) => createElement("section", { "data-hero": name }, machineName,
    createElement("button", { onClick: onOpen, disabled: openDisabled }, "Open conversation"),
    createElement("button", { onClick: onVoice, disabled: voiceDisabled }, "Voice call")),
}));
vi.mock("./assistant-voice-screen", () => ({ AssistantVoiceScreen: ({ children, composer, feedback }: PropsWithChildren<{ composer: React.ReactNode; feedback?: React.ReactNode }>) => createElement("div", null, children, composer, createElement("aside", null, feedback)) }));
vi.mock("./use-assistant-transcript", () => ({ useAssistantTranscript: () => ({ visible: false, toggle: vi.fn() }) }));
vi.mock("./use-assistant-voice-entry", () => ({ useAssistantVoiceEntry: () => ({ pending: false, start: vi.fn(), cancel: vi.fn() }) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "host-a", name: "Work computer" }) }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ token: "epoch-a", review: { environmentId: "env-a" }, isCurrent: () => true }) }));
vi.mock("@/state/queries", () => ({ useHostClient: () => ({}), useHostReadActive: () => true, hostKey: (id: string, parts: unknown[]) => [id, ...parts] }));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({ directoryReady: true, data: [{ id: "project-a", name: "Product project" }], isProjectVisible: () => true }) }));
vi.mock("./assistant-client", () => ({ AssistantMobileClient: class {} }));
vi.mock("@/ui/error-message", () => ({ remoteErrorKind: () => null }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("../approvals/use-approvals", () => ({ usePendingApprovalCount: () => review.approvals }));
vi.mock("./assistant-permissions", () => ({ AssistantPermissions: () => null }));
vi.mock("./assistant-jobs-section", () => ({ AssistantJobsSection: () => null }));
vi.mock("./assistant-questions-section", () => ({ AssistantQuestionsSection: () => null }));
vi.mock("./assistant-composer", () => ({ AssistantComposer: ({ threadId }: { threadId: string }) => createElement("div", { "data-composer": threadId }) }));
vi.mock("./assistant-voice-controls", () => ({ AssistantReadAloud: () => null }));
vi.mock("./assistant-activity-section", () => ({ AssistantActivitySection: () => null }));
vi.mock("./assistant-message-row", () => ({ AssistantMessageRow: () => null }));
vi.mock("./assistant-live-speech", () => ({ AssistantLiveSpeech: () => null }));
vi.mock("../workspace/session-keyboard-frame", () => ({ SessionKeyboardFrame: ({ children, composer }: PropsWithChildren<{ composer?: React.ReactNode }>) => createElement("div", null, children, composer) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}), useQuery: () => ({ data: { snapshot: {
  profile: { name: "Assistant" }, presence: { state: "present" }, jobs: [], ownerQuestions: [],
  threads: [
    { id: "thread-conversation", projectId: "project-a", summary: "", version: 1, createdAt: 1, updatedAt: 1 },
    { id: "thread-planning", projectId: "project-a", purpose: "job-planning", summary: "", version: 2, createdAt: 2, updatedAt: 2 },
  ],
} }, isPending: false, refetch: vi.fn() }) }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Disclosure = ({ label, children }: PropsWithChildren<{ label: string }>) => {
    const [open, setOpen] = useState(false), [visited, setVisited] = useState(false);
    return createElement("details", { open }, createElement("summary", { onClick: (event: React.MouseEvent) => { event.preventDefault(); setVisited(true); setOpen(!open); } }, label), visited ? createElement("div", { hidden: !open }, children) : null);
  };
  return { Body: Group, Row: Group, Screen: Group, Section: Group, Disclosure, Empty: () => null, Notice: () => null, QueryState: () => null,
    Button: ({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label),
    ScreenList: ({ header }: { header: React.ReactNode }) => createElement("main", null, header),
    SelectField: ({ label, options }: { label: string; options: { value: string; label: string }[] }) => createElement("select", { "aria-label": label }, ...options.map(option => createElement("option", { key: option.value, value: option.value }, option.label))) };
});
import { AssistantScreen } from "./assistant-screen";
import { useAssistantCompanion } from "./assistant-companion-state";
it("keeps pending approvals reachable with the voice transcript hidden", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  review.approvals = 2;
  useAssistantCompanion.setState({ surface: "voice" });
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    expect(container.querySelector("aside")?.textContent).toContain("Approvals ({p0} waiting)");
  } finally {
    await act(async () => root.unmount()); review.approvals = 0;
    useAssistantCompanion.setState({ surface: "chat" }); vi.unstubAllGlobals();
  }
});
it("distinguishes normal and planning threads in the same project using the public purpose field", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    expect(container.querySelector('select[aria-label="Recent conversations"]')).toBeNull();
    expect(container.textContent).toContain("Work computer");
    expect([...container.querySelectorAll("button")].some(button => button.textContent === "Open conversation")).toBe(true);
    await act(async () => container.querySelector<HTMLElement>("main > details > summary")!.click());
    const options = [...container.querySelectorAll<HTMLSelectElement>('select[aria-label="Recent conversations"] option')];
    expect(options.map(option => option.value)).toEqual(["thread-conversation", "thread-planning"]);
    expect(options.map(option => option.textContent)).toEqual(["Product project · Conversation", "Product project · Planning"]);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it("opens and closes conversation management without remounting the selected composer", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useAssistantCompanion.setState({ machineId: "host-a", environmentId: "env-a", projectId: "project-a", thread: { id: "thread-conversation", projectId: "project-a", summary: "", version: 1, createdAt: 1, updatedAt: 1 } });
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    const composer = container.querySelector('[data-composer="thread-conversation"]');
    expect(composer).not.toBeNull();
    expect(container.querySelector("[data-call]")).not.toBeNull();
    const conversationControls = container.querySelector("main > details") as HTMLDetailsElement;
    expect(conversationControls.open).toBe(false);
    await act(async () => conversationControls.querySelector("summary")!.click());
    expect(conversationControls).not.toBeNull();
    expect(conversationControls.querySelector("summary")?.textContent).toBe("Conversations");
    expect(conversationControls.querySelector('select[aria-label="Conversation scope"]')).not.toBeNull();
    expect(conversationControls.querySelector('select[aria-label="Recent conversations"]')).not.toBeNull();
    expect(conversationControls.textContent).toContain("Assistant settings");
    const scope = conversationControls.querySelector('select[aria-label="Conversation scope"]');
    await act(async () => conversationControls.querySelector("summary")!.click());
    expect(conversationControls.open).toBe(false);
    expect(conversationControls.querySelector('select[aria-label="Conversation scope"]')).toBe(scope);
    expect(container.querySelector('[data-composer="thread-conversation"]')).toBe(composer);
  } finally {
    await act(async () => root.unmount());
    useAssistantCompanion.setState({ machineId: undefined, environmentId: undefined, projectId: "", thread: null });
    vi.unstubAllGlobals();
  }
});
