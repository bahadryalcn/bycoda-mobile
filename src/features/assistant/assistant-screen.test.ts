// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() }, Stack: { Screen: () => null } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "host-a", name: "Work computer" }) }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ token: "epoch-a", review: { environmentId: "env-a" }, isCurrent: () => true }) }));
vi.mock("@/state/queries", () => ({ useHostClient: () => ({}), useHostReadActive: () => true, hostKey: (id: string, parts: unknown[]) => [id, ...parts] }));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({ directoryReady: true, data: [{ id: "project-a", name: "Product project" }], isProjectVisible: () => true }) }));
vi.mock("./assistant-client", () => ({ AssistantMobileClient: class {} }));
vi.mock("@/ui/error-message", () => ({ remoteErrorKind: () => null }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("../approvals/use-approvals", () => ({ usePendingApprovalCount: () => 0 }));
vi.mock("./assistant-permissions", () => ({ AssistantPermissions: () => null }));
vi.mock("./assistant-jobs-section", () => ({ AssistantJobsSection: () => null }));
vi.mock("./assistant-questions-section", () => ({ AssistantQuestionsSection: () => null }));
vi.mock("./assistant-composer", () => ({ AssistantComposer: () => null }));
vi.mock("./assistant-message-row", () => ({ AssistantMessageRow: () => null }));
vi.mock("../workspace/session-keyboard-frame", () => ({ SessionKeyboardFrame: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}), useQuery: () => ({ data: { snapshot: {
  profile: { name: "Assistant" }, presence: { state: "present" }, jobs: [], ownerQuestions: [],
  threads: [
    { id: "thread-conversation", projectId: "project-a", summary: "", version: 1, createdAt: 1, updatedAt: 1 },
    { id: "thread-planning", projectId: "project-a", purpose: "job-planning", summary: "", version: 2, createdAt: 2, updatedAt: 2 },
  ],
} }, isPending: false, refetch: vi.fn() }) }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Row: Group, Screen: Group, Section: Group, Empty: () => null, Notice: () => null, QueryState: () => null, Button: () => null,
    ScreenList: ({ header }: { header: React.ReactNode }) => createElement("main", null, header),
    SelectField: ({ label, options }: { label: string; options: { value: string; label: string }[] }) => createElement("select", { "aria-label": label }, ...options.map(option => createElement("option", { key: option.value, value: option.value }, option.label))) };
});
import { AssistantScreen } from "./assistant-screen";
it("distinguishes normal and planning threads in the same project using the public purpose field", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AssistantScreen)));
    const options = [...container.querySelectorAll<HTMLSelectElement>('select[aria-label="Recent conversations"] option')];
    expect(options.map(option => option.value)).toEqual(["thread-conversation", "thread-planning"]);
    expect(options.map(option => option.textContent)).toEqual(["Product project · Conversation", "Product project · Planning"]);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
