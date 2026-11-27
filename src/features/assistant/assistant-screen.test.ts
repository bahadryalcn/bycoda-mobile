// @vitest-environment happy-dom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { AssistantMessage, AssistantThread } from "../../../../src/shared/model/host-contracts/assistant";
const review = vi.hoisted(() => ({
  approvals: 0, pending: false, messages: [] as AssistantMessage[], extraThreads: [] as AssistantThread[],
  directoryReady: true, verifying: false, projectVisible: true, voiceBusy: false,
  preventRemove: undefined as undefined | ((event: { data: { action: { type: string } } }) => void), dispatch: vi.fn(),
}));
vi.mock("expo-router/react-navigation", () => ({
  useNavigation: () => ({ dispatch: review.dispatch }),
  usePreventRemove: (enabled: boolean, callback: (event: { data: { action: { type: string } } }) => void) => { review.preventRemove = enabled ? callback : undefined; },
}));
vi.mock("../workspace/transcript-skeleton", () => ({ TranscriptSkeleton: () => createElement("div", { "data-transcript-skeleton": true }) }));
vi.mock("./assistant-conversations", () => ({
  AssistantConversationsButton: ({ options, onSelect }: { options: { value: string; label: string; detail?: string }[]; onSelect(id: string): boolean }) =>
    createElement("nav", { "data-conversations": true }, ...options.map(option =>
      createElement("button", { key: option.value, "data-thread": option.value, "data-detail": option.detail, onClick: () => onSelect(option.value) }, option.label))),
}));
// The assistant's own scope pill: its label, and one choice per scope instead of the picker sheet.
vi.mock("./assistant-scope-pill", () => ({
  AssistantScopePill: ({ projectId, label, disabled, onChange }: { projectId: string; label: string; disabled?: boolean; onChange(value: string): void }) =>
    createElement("div", { "data-scope-pill": projectId, "data-label": label, "data-disabled": disabled ? "true" : undefined },
      createElement("button", { "data-scope-choice": "", onClick: () => onChange("") }),
      createElement("button", { "data-scope-choice": "project-a", onClick: () => onChange("project-a") })),
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() }, Stack: { Screen: () => null } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "en-GB" }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { muted: "muted" }, uiStyles: { grow: {}, caption: {}, heading: {} } }) }));
vi.mock("./assistant-call-controls", () => ({ AssistantCallButton: () => createElement("button", { "data-call": true }, "Voice call"), AssistantCallErrorNotice: () => null }));
vi.mock("./assistant-call-session", () => ({ endAssistantCall: vi.fn() }));
vi.mock("./assistant-reply-model", () => ({ AssistantReplyModel: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("../voice-settings/call-voice-button", () => ({
  AssistantSettingsButton: ({ children }: PropsWithChildren) => {
    const [open, setOpen] = useState(false);
    return createElement("div", { "data-call-settings": true },
      createElement("button", { onClick: () => setOpen(!open) }, "Settings"),
      open ? createElement("section", null, children) : null);
  },
}));
vi.mock("./assistant-home-hero", () => ({
  AssistantHomeLoading: () => createElement("div", { role: "progressbar", "data-assistant-orb": true }),
  AssistantHomeHero: ({ name, machineName }: { name: string; machineName: string }) => createElement("section", { "data-hero": name }, machineName),
  AssistantHomeActions: ({ onOpen, onVoice, openDisabled, voiceDisabled }: { onOpen(): void; onVoice(): void; openDisabled: boolean; voiceDisabled: boolean }) => createElement("footer", { "data-home-actions": true },
    createElement("button", { onClick: onOpen, disabled: openDisabled }, "Open conversation"),
    createElement("button", { onClick: onVoice, disabled: voiceDisabled }, "Voice call")),
}));
// The companion store is real; its lazily loaded recorders and voice preferences are not needed here.
vi.mock("../workspace/dictation-engine", () => ({ dictationEngineKind: () => "computer", loadDictationRecorder: vi.fn() }));
vi.mock("../voice-settings/voice-preferences", () => ({ voicePreferences: { getState: () => ({ hydrate: async () => {}, preferences: {} }) } }));
vi.mock("./assistant-companion", () => ({
  useAssistantVoiceBusy: () => review.voiceBusy,
  AssistantMinimizeButton: () => createElement("button", { "data-minimize": true }, "Minimize assistant"),
}));
vi.mock("./assistant-voice-screen", () => ({ AssistantVoiceScreen: ({ children, composer, feedback, settings, actions, stage, active, scope, scopeControl }: PropsWithChildren<{ composer: React.ReactNode; feedback?: React.ReactNode; settings?: React.ReactNode; actions?: React.ReactNode; stage: boolean; active: boolean; scope: { computer?: string; project?: string }; scopeControl?: React.ReactNode }>) => createElement("div", null,
  // The home and call stages' top row: the computer pill, the conversation scope, conversations and settings.
  stage || active ? createElement("span", { "data-stage-scope": scope.project ?? "", "data-stage-computer": scope.computer }, scopeControl) : null,
  stage ? actions : null, stage ? settings : null, children, composer, createElement("aside", null, feedback)) }));
vi.mock("./use-assistant-transcript", () => ({ useAssistantTranscript: () => ({ visible: false, toggle: vi.fn() }) }));
vi.mock("./use-assistant-voice-entry", () => ({ useAssistantVoiceEntry: () => ({ pending: false, start: vi.fn(), cancel: vi.fn() }) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "host-a", name: "Work computer" }) }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ token: "epoch-a", review: { environmentId: "env-a" }, isCurrent: () => true }) }));
vi.mock("@/state/queries", () => ({ useHostClient: () => ({}), useHostReadActive: () => true, hostKey: (id: string, parts: unknown[]) => [id, ...parts] }));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({
  directoryReady: review.directoryReady,
  verifying: review.verifying,
  data: [{ id: "project-a", name: "Product project" }],
  isProjectVisible: () => review.projectVisible,
}) }));
// Opening a scope's conversation answers with that scope's own thread.
vi.mock("./assistant-client", () => ({ AssistantMobileClient: class {
  read = async (request: { op: string; projectId?: string }) => request.op === "threads.open"
    ? { thread: { id: `thread-${request.projectId ?? "global"}`, ...(request.projectId ? { projectId: request.projectId } : {}), summary: "", version: 1, createdAt: 3, updatedAt: 3 } }
    : {};
} }));
vi.mock("@/ui/error-message", () => ({ remoteErrorKind: () => null }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
import { confirmAction } from "@/ui/confirm";
vi.mock("../approvals/use-approvals", () => ({ usePendingApprovalCount: () => review.approvals }));
vi.mock("./assistant-jobs-section", () => ({ AssistantJobsSection: () => null }));
vi.mock("./assistant-questions-section", () => ({ AssistantQuestionsSection: () => null }));
vi.mock("./assistant-composer", () => ({ AssistantComposer: ({ threadId }: { threadId: string }) => createElement("div", { "data-composer": threadId }) }));
vi.mock("./assistant-voice-controls", () => ({ AssistantReadAloud: () => null }));
vi.mock("./assistant-activity-section", () => ({ AssistantActivitySection: () => null }));
vi.mock("./assistant-message-row", () => ({
  AssistantMessageRow: ({ message }: { message: AssistantMessage }) => createElement("p", null, message.text),
  AssistantCallSeparator: ({ at }: { at: number }) => createElement("hr", { "data-call-mark": at }),
}));
vi.mock("./assistant-live-speech", () => ({ AssistantLiveSpeech: () => null }));
vi.mock("../workspace/session-keyboard-frame", () => ({ SessionKeyboardFrame: ({ children, composer }: PropsWithChildren<{ composer?: React.ReactNode }>) => createElement("div", null, children, composer) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}), useQuery: ({ queryKey }: { queryKey: unknown[] }) => queryKey.includes("messages")
  ? { data: { messages: review.messages }, isPending: false, refetch: vi.fn() }
  : review.pending
  ? { isPending: true, fetchStatus: "fetching", refetch: vi.fn() }
  : ({ data: { snapshot: {
  profile: { name: "Assistant" }, presence: { state: "present" }, jobs: [], ownerQuestions: [],
  threads: [
    { id: "thread-conversation", projectId: "project-a", summary: "", version: 1, createdAt: 1, updatedAt: 1 },
    { id: "thread-planning", projectId: "project-a", purpose: "job-planning", summary: "", version: 2, createdAt: 2, updatedAt: 2 },
    ...review.extraThreads,
  ],
} }, isPending: false, refetch: vi.fn() }) }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Disclosure = ({ label, children }: PropsWithChildren<{ label: string }>) => {
    const [open, setOpen] = useState(false), [visited, setVisited] = useState(false);
    return createElement("details", { open }, createElement("summary", { onClick: (event: React.MouseEvent) => { event.preventDefault(); setVisited(true); setOpen(!open); } }, label), visited ? createElement("div", { hidden: !open }, children) : null);
  };
  return { Body: Group, Row: Group, Screen: Group, Section: Group, NavigationGroup: Group, Disclosure, Empty: () => null, Notice: () => null, ErrorNotice: () => null,
    NavigationRow: ({ label, detail, onPress }: { label: string; detail?: string; onPress(): void }) => createElement("button", { onClick: onPress }, `${label} · ${detail ?? ""}`),
    StatusText: ({ label }: { label: string }) => createElement("span", null, label),
    SegmentedControl: ({ label, options }: { label: string; options: { value: string; label: string }[] }) => createElement("div", { role: "radiogroup", "aria-label": label }, ...options.map(option => createElement("span", { key: option.value }, option.label))),
    QueryState: ({ query, loading, renderLoading }: { query: { isPending?: boolean }; loading?: string; renderLoading?: (label: string) => React.ReactNode }) =>
      query.isPending ? (renderLoading?.("Loading…") ?? (loading === "content" ? createElement("div", { "data-skeleton": true }) : null)) : null,
    Button: ({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label),
    ScreenList: ({ header, scope, scopeControl, actions, headerFill, ListEmptyComponent, data, renderItem }: {
      header: React.ReactNode;
      scope?: { computer?: string; project?: string };
      scopeControl?: React.ReactNode;
      actions?: React.ReactNode;
      headerFill?: boolean;
      ListEmptyComponent?: React.ReactNode;
      data?: AssistantMessage[];
      renderItem?: (row: { item: AssistantMessage; index: number }) => React.ReactNode;
    }) => createElement("main", { "data-header-fill": headerFill ? "true" : undefined },
      scope ? createElement("header", { "data-scope": [scope.computer, scope.project].filter(Boolean).join(" · ") }, scopeControl, actions) : null, header,
      data?.length ? data.map((item, index) => createElement("div", { key: item.id }, renderItem?.({ item, index }))) : ListEmptyComponent),
    SelectField: ({ label, options }: { label: string; options: { value: string; label: string; detail?: string; disabled?: boolean }[] }) => createElement("select", { "aria-label": label }, ...options.map(option => createElement("option", { key: option.value, value: option.value, disabled: option.disabled, "data-detail": option.detail }, option.label))) };
});
import { AssistantScreen } from "./assistant-screen";
import { useAssistantCompanion } from "./assistant-companion-state";
import { useAssistantCallEpisodes } from "./assistant-call-episode";
import { useAssistantCall } from "./assistant-call-state";
it("shows only the assistant loading orb before the Room snapshot is ready", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  review.pending = true;
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    expect(container.querySelector("[data-assistant-orb]")).not.toBeNull();
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    expect(container.textContent).not.toContain("Conversations");
  } finally {
    await act(async () => root.unmount()); review.pending = false; vi.unstubAllGlobals();
  }
});
it("keeps pending approvals reachable with the voice transcript hidden", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  review.approvals = 2;
  useAssistantCompanion.setState({ surface: "voice" });
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    expect(container.querySelector("aside")?.textContent).toContain("Approvals · {p0} waiting");
  } finally {
    await act(async () => root.unmount()); review.approvals = 0;
    useAssistantCompanion.setState({ surface: "chat" }); vi.unstubAllGlobals();
  }
});
// The home listed presence, an empty "What I did" and a "Recent conversations" picker; the owner asked
// for a calm front door. Conversations open from the header; presence moved to Settings → Assistant.
it("keeps the home to its hero, with conversations in the header and presence out of the sheet", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    expect(container.textContent).toContain("Work computer");
    expect([...container.querySelectorAll("button")].some(button => button.textContent === "Open conversation")).toBe(true);
    expect(container.querySelector("main select")).toBeNull();
    expect(container.querySelector('main [aria-label="My presence"]')).toBeNull();
    const threads = [...container.querySelectorAll<HTMLButtonElement>("[data-conversations] button")];
    expect(threads.map(button => button.getAttribute("data-thread"))).toEqual(["thread-conversation", "thread-planning"]);
    // Without a summary a row is named by its purpose; scope and time are its detail.
    expect(threads.map(button => button.textContent)).toEqual(["Conversation", "Planning"]);
    expect(threads.every(button => button.getAttribute("data-detail")?.startsWith("Product project · "))).toBe(true);
    // The scope is chosen in the top row (General here), so the settings sheet no longer repeats it.
    expect(container.querySelector("[data-stage-scope] [data-scope-pill]")?.getAttribute("data-label")).toBe("Global");
    await act(async () => container.querySelector<HTMLButtonElement>("[data-call-settings] button")!.click());
    expect(container.querySelector('[data-call-settings] select[aria-label="Scope"]')).toBeNull();
    expect(container.querySelector('[aria-label="My presence"]')).toBeNull();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

// After opening a conversation the owner could never get back to the assistant's home: the chosen thread
// was restored on every visit and Back left the assistant instead.
it("returns from a conversation to the home on Back and does not reopen it on the next visit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-thread="thread-conversation"]')!.click());
    expect(container.querySelector('[data-composer="thread-conversation"]')).not.toBeNull();
    expect(container.querySelector("[data-hero]")).toBeNull();
    expect(review.preventRemove).toBeDefined();
    await act(async () => review.preventRemove!({ data: { action: { type: "GO_BACK" } } }));
    expect(container.querySelector("[data-hero]")).not.toBeNull();
    expect(container.querySelector("[data-composer]")).toBeNull();
    expect(review.preventRemove).toBeUndefined();
    expect(review.dispatch).not.toHaveBeenCalled();
    // A later visit starts on the home even though the companion remembers the conversation.
    await act(async () => container.querySelector<HTMLButtonElement>('[data-thread="thread-conversation"]')!.click());
    await act(async () => root.unmount());
    const again = createRoot(container);
    await act(async () => again.render(createElement(AssistantScreen)));
    expect(container.querySelector("[data-hero]")).not.toBeNull();
    await act(async () => again.unmount());
  } finally {
    useAssistantCompanion.setState({ machineId: undefined, environmentId: undefined, projectId: "", thread: null });
    vi.unstubAllGlobals();
  }
});

it.each([
  { projectId: "project-missing", verifying: true, label: "Loading projects…" },
  { projectId: "project-a", verifying: false, label: "Project" },
])("keeps the selected project scope while verifying access ($projectId)", async ({ projectId, verifying, label }) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  review.directoryReady = !verifying;
  review.verifying = verifying;
  review.projectVisible = false;
  useAssistantCompanion.setState({ machineId: "host-a", environmentId: "env-a", projectId, thread: null });
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    const pill = container.querySelector("[data-stage-scope] [data-scope-pill]");
    expect(pill?.getAttribute("data-scope-pill")).toBe(projectId);
    expect(pill?.getAttribute("data-label")).toBe(label);
    expect(container.textContent).not.toContain("Product project");
  } finally {
    await act(async () => root.unmount());
    review.directoryReady = true; review.verifying = false; review.projectVisible = true;
    useAssistantCompanion.setState({ machineId: undefined, environmentId: undefined, projectId: "", thread: null });
    vi.unstubAllGlobals();
  }
});

it("titles recent conversations by their visible summary, with scope, purpose and time below", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  review.extraThreads = [
    { id: "summarized", projectId: "project-a", summary: "Release checklist\nand more", summaryProof: { projectIds: ["project-a"] }, version: 1, createdAt: 1, updatedAt: 1 } as AssistantThread,
  ];
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    const option = container.querySelector<HTMLButtonElement>('[data-conversations] [data-thread="summarized"]')!;
    expect(option.textContent).toBe("Release checklist");
    expect(option.getAttribute("data-detail")).toMatch(/^Product project · Conversation · .*1970/);
  } finally {
    await act(async () => root.unmount());
    review.extraThreads = [];
    vi.unstubAllGlobals();
  }
});

it("opens and closes header settings without remounting the selected composer", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const reply = { threadId: "thread-conversation", version: 1, via: "text", role: "assistant", jobIds: [] as string[] } as const;
  review.messages = [
    { ...reply, id: "verified", projectIds: [], createdAt: 1, updatedAt: 1, text: "Verified reply" },
    { ...reply, id: "unverified", createdAt: 2, updatedAt: 2, text: "Unverified reply" },
  ];
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-thread="thread-conversation"]')!.click());
    const composer = container.querySelector('[data-composer="thread-conversation"]');
    expect(composer).not.toBeNull();
    expect(container.textContent).toContain("Verified reply");
    expect(container.textContent).not.toContain("Unverified reply");
    expect(container.textContent).not.toMatch(/messages.*(hidden|concealed)/i);
    expect(container.querySelector("[data-call]")).not.toBeNull();
    expect(container.querySelector("main > details > summary")).toBeNull();
    const settings = container.querySelector("[data-call-settings]")!;
    await act(async () => settings.querySelector("button")!.click());
    expect(settings.querySelector('select[aria-label="Scope"]')).toBeNull();
    expect(settings.querySelector('select[aria-label="My presence"]')).toBeNull();
    // Stopping all work moved from the settings sheet to the jobs on the home.
    expect(settings.textContent).not.toContain("Pause the assistant's work");
    await act(async () => settings.querySelector("button")!.click());
    expect(settings.querySelector("section")).toBeNull();
    expect(container.querySelector('[data-composer="thread-conversation"]')).toBe(composer);
  } finally {
    await act(async () => root.unmount());
    review.messages = [];
    useAssistantCompanion.setState({ machineId: undefined, environmentId: undefined, projectId: "", thread: null });
    vi.unstubAllGlobals();
  }
});

it("docks the home's start actions and puts an open conversation's scope and actions in the shared top row", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    // Home: the hero fills the free height; Voice call and Write sit in the bottom dock, the computer in the top row.
    expect(container.querySelector("main")?.getAttribute("data-header-fill")).toBe("true");
    expect(container.querySelector("[data-home-actions]")).not.toBeNull();
    expect(container.querySelector("[data-stage-scope]")?.getAttribute("data-stage-computer")).toBe("Work computer");
    expect(container.querySelector("main > header")).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('[data-thread="thread-conversation"]')!.click());
    // Conversation: no custom row; the shared heading gets the pills and the icon actions.
    expect(container.querySelector("[data-home-actions]")).toBeNull();
    const header = container.querySelector("main > header")!;
    // The computer is read-only; the conversation's scope is its own pill in the same row.
    expect(header.getAttribute("data-scope")).toBe("Work computer");
    expect(header.querySelector("[data-scope-pill]")?.getAttribute("data-label")).toBe("Product project");
    expect(header.querySelector("[data-call]")).not.toBeNull();
    expect(header.querySelector("[data-conversations]")).not.toBeNull();
    expect(header.querySelector("[data-call-settings]")).not.toBeNull();
    expect(header.querySelector("[data-minimize]")).toBeNull();
    // While dictation, read-aloud or a call runs, Minimize takes the call's slot in the same row.
    review.voiceBusy = true;
    await act(async () => root.render(createElement(AssistantScreen)));
    expect(container.querySelector("main > header [data-minimize]")).not.toBeNull();
    expect(container.querySelector("main > header [data-call]")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    review.voiceBusy = false;
    useAssistantCompanion.setState({ machineId: undefined, environmentId: undefined, projectId: "", thread: null });
    vi.unstubAllGlobals();
  }
});

const spoken = (id: string, createdAt: number, role: "user" | "assistant", via: "text" | "voice"): AssistantMessage =>
  ({ id, threadId: "thread-conversation", version: 1, role, via, jobIds: [], projectIds: [], createdAt, updatedAt: createdAt, text: id });
// One conversation per scope: the chat marks where each call began, the call screen shows only this call.
it("marks voice calls in the chat and shows only the current call on the call screen", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  review.messages = [spoken("typed earlier", 1, "user", "text"), spoken("typed reply", 2, "assistant", "text"),
    spoken("spoken now", 3, "user", "voice"), spoken("spoken reply", 4, "assistant", "voice")];
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-thread="thread-conversation"]')!.click());
    const texts = () => [...container.querySelectorAll("main > div")].map(row => row.querySelector("hr") ? "call" : row.textContent);
    expect(texts()).toEqual(["typed earlier", "typed reply", "call", "spoken now", "spoken reply"]);
    await act(async () => root.unmount());
    // The call screen of a call that began after "typed reply": earlier messages wait behind one button.
    useAssistantCompanion.setState({ surface: "voice" });
    useAssistantCallEpisodes.setState({ episodes: [{ id: 1, threadId: "thread-conversation", startedAt: 0, baseline: 2, open: true, transcript: false, composer: false, earlier: false }] });
    const again = createRoot(container);
    await act(async () => again.render(createElement(AssistantScreen)));
    expect(texts()).toEqual(["call", "spoken now", "spoken reply"]);
    expect(container.textContent).not.toContain("No messages are available");
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Load earlier messages")!.click());
    expect(texts()).toEqual(["typed earlier", "typed reply", "call", "spoken now", "spoken reply"]);
    await act(async () => again.unmount());
  } finally {
    review.messages = [];
    useAssistantCallEpisodes.setState({ episodes: [] });
    useAssistantCompanion.setState({ surface: "chat", machineId: undefined, environmentId: undefined, projectId: "", thread: null });
    vi.unstubAllGlobals();
  }
});

// As on the desktop, the conversation's scope is General or one project, chosen in the top row; each scope
// has its own conversation, and a live call asks before it ends.
it("switches to the chosen scope's conversation from the top row and confirms during a call", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-thread="thread-conversation"]')!.click());
    expect(container.querySelector("main > header [data-scope-pill]")?.getAttribute("data-scope-pill")).toBe("project-a");
    // General: the project's conversation gives way to the General conversation, in the same top row.
    await act(async () => container.querySelector<HTMLButtonElement>('main > header [data-scope-choice=""]')!.click());
    expect(container.querySelector('[data-composer="thread-global"]')).not.toBeNull();
    expect(container.querySelector("main > header [data-scope-pill]")?.getAttribute("data-label")).toBe("Global");
    expect(useAssistantCompanion.getState().projectId).toBe("");
    // Back to the home: it shows the same scope.
    await act(async () => review.preventRemove!({ data: { action: { type: "GO_BACK" } } }));
    expect(container.querySelector("[data-stage-scope] [data-scope-pill]")?.getAttribute("data-label")).toBe("Global");
    expect(confirmAction).not.toHaveBeenCalled();
    // During a listening call the change waits for the owner's confirmation.
    await act(async () => useAssistantCall.setState({ phase: "listening" }));
    await act(async () => root.render(createElement(AssistantScreen)));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-stage-scope] [data-scope-choice="project-a"]')!.click());
    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(useAssistantCompanion.getState().projectId).toBe("");
    // While a reply is on its way the scope cannot change at all.
    await act(async () => useAssistantCall.setState({ phase: "sending" }));
    await act(async () => root.render(createElement(AssistantScreen)));
    expect(container.querySelector("[data-stage-scope] [data-scope-pill]")?.getAttribute("data-disabled")).toBe("true");
  } finally {
    await act(async () => root.unmount());
    useAssistantCall.setState({ phase: "idle" });
    vi.mocked(confirmAction).mockClear();
    useAssistantCompanion.setState({ machineId: undefined, environmentId: undefined, projectId: "", thread: null });
    vi.unstubAllGlobals();
  }
});
