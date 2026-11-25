// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { getQueryPresentation, type QueryLike } from "@/ui/query-presentation";
const fixture = vi.hoisted(() => ({
  push: vi.fn(),
  mutate: vi.fn(),
  providers: [] as string[],
  projectId: null as string | null,
  directoryReady: true,
  projectVisible: true,
  automations: [] as { id: string; name: string; prompt: string; projectId: string; enabled: boolean }[],
}));
vi.mock("react-native", () => ({ View: "div", useWindowDimensions: () => ({ fontScale: 1 }) }));
vi.mock("expo-router", () => ({ router: { navigate: fixture.push } }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "host-a", providers: fixture.providers }), useMachines: (selector: (state: unknown) => unknown) => selector({ selectedProjectId: fixture.projectId }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: (_key: unknown, method: string) => ({ data: method === "automations.list" ? fixture.automations : [], isSuccess: true }), useHostMutation: () => ({ isPending: false, mutate: fixture.mutate, reset: vi.fn() }) }));
vi.mock("./shared/use-editor-record", () => ({ useEditorRecord: () => undefined }));
vi.mock("./shared/format", () => ({ identifier: () => "fixture-automation" }));
vi.mock("./shared/scope", () => ({ Scope: () => null }));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({
  directoryReady: fixture.directoryReady,
  isProjectVisible: () => fixture.projectVisible,
}) }));
vi.mock("./automations/automation-editor", () => ({ AutomationEditor: () => null }));
vi.mock("./automations/automation-card", () => ({ AutomationCard: () => null }));
vi.mock("@/ui/filter-sheet", () => ({ AppliedFilters: () => null, FilterButton: () => null, FilterSheet: () => null }));
vi.mock("@/ui/screen-list", () => ({ ScreenList: ({ header, actions, data, ListEmptyComponent }: { header: React.ReactNode; actions: React.ReactNode; data: unknown[]; ListEmptyComponent?: React.ReactNode }) => createElement("main", null, createElement("nav", null, actions), header, data.length ? null : ListEmptyComponent) }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Button: () => null, Sheet: () => null, MutationState: () => null, SelectField: () => null, SearchField: () => null, SearchToolbar: () => null,
    QueryState: ({ query, empty, emptyAction }: { query: QueryLike; empty?: boolean; emptyAction?: { label: string; onPress(): void } }) =>
      getQueryPresentation(query, empty) === "empty" && emptyAction ? createElement("button", { onClick: emptyAction.onPress }, emptyAction.label) : null,
    IconButton: ({ label, disabled }: { label: string; disabled?: boolean }) => createElement("button", { disabled }, label),
    Notice: ({ message, retryLabel, onRetry }: { message: string; retryLabel?: string; onRetry?(): void }) => createElement("aside", null, message, retryLabel ? createElement("button", { onClick: onRetry }, retryLabel) : null) };
});
import { AutomationsScreen } from "./automations-screen";
it("explains missing providers and retains recovery for global automations", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AutomationsScreen)));
    expect(container.textContent).toContain("This computer has not reported an available agent. Check providers.");
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.find(node => node.textContent === "New automation")).toBeUndefined();
    await act(async () => buttons.find(node => node.textContent === "Provider center")!.click());
    expect(fixture.push).toHaveBeenCalledExactlyOnceWith("/tools/providers"); expect(fixture.mutate).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});

it.each([
  { directoryReady: false, projectVisible: true },
  { directoryReady: true, projectVisible: false },
])("keeps a new automation disabled until the selected project is verified (%o)", async ({ directoryReady, projectVisible }) => {
  fixture.providers = ["codex"];
  fixture.projectId = "previous-project";
  fixture.directoryReady = directoryReady;
  fixture.projectVisible = projectVisible;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  const start = () => [...container.querySelectorAll("button")].filter(node => node.textContent === "New automation");
  try {
    await act(async () => root.render(createElement(AutomationsScreen)));
    expect(start()).toHaveLength(0);
    fixture.directoryReady = true;
    fixture.projectVisible = true;
    await act(async () => root.render(createElement(AutomationsScreen)));
    expect(start()).toHaveLength(1);
    expect(start()[0]!.closest("nav")).toBeNull();
    fixture.automations = [{ id: "a", name: "Automation", prompt: "", projectId: "previous-project", enabled: true }];
    await act(async () => root.render(createElement(AutomationsScreen)));
    expect(start()).toHaveLength(1);
    expect(start()[0]!.closest("nav")).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    fixture.providers = [];
    fixture.projectId = null;
    fixture.directoryReady = true;
    fixture.projectVisible = true;
    fixture.automations = [];
    vi.unstubAllGlobals();
  }
});
