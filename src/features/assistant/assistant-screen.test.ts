// @vitest-environment happy-dom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { AssistantMessage, AssistantThread } from "../../../../src/shared/model/host-contracts/assistant";
const review = vi.hoisted(() => ({
  approvals: 0, pending: false, messages: [] as AssistantMessage[], extraThreads: [] as AssistantThread[],
  directoryReady: true, verifying: false, projectVisible: true,
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() }, Stack: { Screen: () => null } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "en-GB" }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { muted: "muted" }, uiStyles: { grow: {}, caption: {}, heading: {} } }) }));
vi.mock("./assistant-call-controls", () => ({ AssistantCallButton: () => createElement("button", { "data-call": true }, "Voice call"), AssistantCallError: () => null }));
vi.mock("./assistant-call-session", () => ({ endAssistantCall: vi.fn() }));
vi.mock("./assistant-reply-model", () => ({ AssistantReplyModel: () => null }));
vi.mock("../voice-settings/call-voice-button", () => ({
  CallVoiceButton: ({ children, details }: PropsWithChildren<{ details?: React.ReactNode }>) => {
    const [open, setOpen] = useState(false);
    return createElement("div", { "data-call-settings": true },
      createElement("button", { onClick: () => setOpen(!open) }, "Settings"),
      open ? createElement("section", null, children, details) : null);
  },
}));
vi.mock("./assistant-home-hero", () => ({
  AssistantHomeLoading: () => createElement("div", { role: "progressbar", "data-assistant-orb": true }),
  AssistantContextLine: ({ machineName, scope }: { machineName: string; scope: string }) => createElement("span", null, `${machineName} ${scope}`),
  AssistantHomeHero: ({ name, machineName, scope, onOpen, onVoice, openDisabled, voiceDisabled }: { name: string; machineName: string; scope: string; onOpen(): void; onVoice(): void; openDisabled: boolean; voiceDisabled: boolean }) => createElement("section", { "data-hero": name, "data-scope": scope }, machineName,
    createElement("button", { onClick: onOpen, disabled: openDisabled }, "Open conversation"),
    createElement("button", { onClick: onVoice, disabled: voiceDisabled }, "Voice call")),
}));
vi.mock("./assistant-voice-screen", () => ({ AssistantVoiceScreen: ({ children, composer, feedback, settings, stage }: PropsWithChildren<{ composer: React.ReactNode; feedback?: React.ReactNode; settings?: React.ReactNode; stage: boolean }>) => createElement("div", null, stage ? settings : null, children, composer, createElement("aside", null, feedback)) }));
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
vi.mock("./assistant-message-row", () => ({
  AssistantMessageRow: ({ message }: { message: AssistantMessage }) => createElement("p", null, message.text),
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
  return { Body: Group, Row: Group, Screen: Group, Section: Group, NavigationGroup: Group, Disclosure, Empty: () => null, Notice: () => null,
    SegmentedControl: ({ label, options }: { label: string; options: { value: string; label: string }[] }) => createElement("div", { role: "radiogroup", "aria-label": label }, ...options.map(option => createElement("span", { key: option.value }, option.label))),
    QueryState: ({ query, loading, renderLoading }: { query: { isPending?: boolean }; loading?: string; renderLoading?: (label: string) => React.ReactNode }) =>
      query.isPending ? (renderLoading?.("Loading…") ?? (loading === "content" ? createElement("div", { "data-skeleton": true }) : null)) : null,
    Button: ({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label),
    ScreenList: ({ header, ListEmptyComponent, data, renderItem }: {
      header: React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
      data?: AssistantMessage[];
      renderItem?: (row: { item: AssistantMessage; index: number }) => React.ReactNode;
    }) => createElement("main", null, header,
      data?.length ? data.map((item, index) => createElement("div", { key: item.id }, renderItem?.({ item, index }))) : ListEmptyComponent),
    SelectField: ({ label, options }: { label: string; options: { value: string; label: string; detail?: string; disabled?: boolean }[] }) => createElement("select", { "aria-label": label }, ...options.map(option => createElement("option", { key: option.value, value: option.value, disabled: option.disabled, "data-detail": option.detail }, option.label))) };
});
import { AssistantScreen } from "./assistant-screen";
import { useAssistantCompanion } from "./assistant-companion-state";
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
    expect(container.textContent).toContain("Work computer");
    expect([...container.querySelectorAll("button")].some(button => button.textContent === "Open conversation")).toBe(true);
    expect(container.querySelector("main > details > summary")).toBeNull();
    // Switching conversations is navigation: the list is on the home, not in the settings sheet.
    await act(async () => container.querySelector<HTMLButtonElement>("[data-call-settings] button")!.click());
    expect(container.querySelector('[data-call-settings] select[aria-label="Recent conversations"]')).toBeNull();
    // Presence is on the home itself, not behind the gear.
    expect(container.querySelector('main [role="radiogroup"][aria-label="My presence"]')).not.toBeNull();
    const options = [...container.querySelectorAll<HTMLSelectElement>('select[aria-label="Recent conversations"] option')];
    expect(options.map(option => option.value)).toEqual(["thread-conversation", "thread-planning"]);
    expect(options.map(option => option.textContent)).toEqual(["Product project · Conversation", "Product project · Planning"]);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
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
    expect(container.querySelector("[data-scope]")?.getAttribute("data-scope")).toBe(label);
    await act(async () => container.querySelector<HTMLButtonElement>("[data-call-settings] button")!.click());
    const scope = container.querySelector(`select[aria-label="Conversation scope"] option[value="${projectId}"]`) as HTMLOptionElement | null;
    expect(scope?.textContent).toBe(label);
    expect(scope?.disabled).toBe(true);
    expect(container.textContent).not.toContain("Product project");
  } finally {
    await act(async () => root.unmount());
    review.directoryReady = true; review.verifying = false; review.projectVisible = true;
    useAssistantCompanion.setState({ machineId: undefined, environmentId: undefined, projectId: "", thread: null });
    vi.unstubAllGlobals();
  }
});

it("gives same-purpose recent threads distinct details even when their formatted times match", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  review.extraThreads = [
    { id: "same-time", projectId: "project-a", summary: "", version: 1, createdAt: 1, updatedAt: 1 },
    { id: "later", projectId: "project-a", summary: "", version: 1, createdAt: 86_400_001, updatedAt: 86_400_001 },
  ];
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    await act(async () => container.querySelector<HTMLButtonElement>("[data-call-settings] button")!.click());
    const options = [...container.querySelectorAll<HTMLOptionElement>('select[aria-label="Recent conversations"] option')]
      .filter(option => option.textContent === "Product project · Conversation");
    expect(options.map(option => option.value)).toEqual(["thread-conversation", "same-time", "later"]);
    const details = options.map(option => option.getAttribute("data-detail"));
    expect(details.every(detail => detail?.includes("1970"))).toBe(true);
    expect(new Set(details).size).toBe(3);
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
  useAssistantCompanion.setState({ machineId: "host-a", environmentId: "env-a", projectId: "project-a", thread: { id: "thread-conversation", projectId: "project-a", summary: "", version: 1, createdAt: 1, updatedAt: 1 } });
  const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    const composer = container.querySelector('[data-composer="thread-conversation"]');
    expect(composer).not.toBeNull();
    expect(container.textContent).toContain("Verified reply");
    expect(container.textContent).not.toContain("Unverified reply");
    expect(container.textContent).not.toMatch(/messages.*(hidden|concealed)/i);
    expect(container.querySelector("[data-call]")).not.toBeNull();
    expect(container.querySelector("main > details > summary")).toBeNull();
    const settings = container.querySelector("[data-call-settings]")!;
    await act(async () => settings.querySelector("button")!.click());
    expect(settings.querySelector('select[aria-label="Conversation scope"]')).not.toBeNull();
    expect(settings.querySelector('select[aria-label="Recent conversations"]')).not.toBeNull();
    expect(settings.textContent).not.toContain("My presence");
    expect(settings.textContent).toContain("Pause the assistant's work");
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
