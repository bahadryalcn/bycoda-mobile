// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ push: vi.fn(), mutate: vi.fn() }));
vi.mock("expo-router", () => ({ router: { push: fixture.push } }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "host-a", providers: [] }), useMachines: (selector: (state: unknown) => unknown) => selector({ selectedProjectId: null }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => ({ data: [], isSuccess: true }), useHostMutation: () => ({ isPending: false, mutate: fixture.mutate, reset: vi.fn() }) }));
vi.mock("./shared/use-editor-record", () => ({ useEditorRecord: () => undefined }));
vi.mock("./shared/format", () => ({ identifier: () => "fixture-automation" }));
vi.mock("./shared/scope", () => ({ Scope: () => null }));
vi.mock("./automations/automation-editor", () => ({ AutomationEditor: () => null }));
vi.mock("./automations/automation-card", () => ({ AutomationCard: () => null }));
vi.mock("@/ui/filter-sheet", () => ({ AppliedFilters: () => null, FilterButton: () => null, FilterSheet: () => null }));
vi.mock("@/ui/screen-list", () => ({ ScreenList: ({ header, actions }: { header: React.ReactNode; actions: React.ReactNode }) => createElement("main", null, actions, header) }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Button: () => null, Sheet: () => null, MutationState: () => null, QueryState: () => null, SelectField: () => null, SearchField: () => null, SearchToolbar: () => null,
    IconButton: ({ label, disabled }: { label: string; disabled?: boolean }) => createElement("button", { disabled }, label),
    Notice: ({ message, retryLabel, onRetry }: { message: string; retryLabel?: string; onRetry?(): void }) => createElement("aside", null, message, retryLabel ? createElement("button", { onClick: onRetry }, retryLabel) : null) };
});
import { AutomationsScreen } from "./automations-screen";
it("explains missing providers and retains recovery for global automations", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); const container = document.createElement("div"), root = createRoot(container);
  try {
    await act(async () => root.render(createElement(AutomationsScreen)));
    expect(container.textContent).toContain("Projectless automations run in Room.");
    expect(container.textContent).toContain("This computer has not reported an available agent. Check providers.");
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.find(node => node.textContent === "New automation")?.disabled).toBe(true);
    await act(async () => buttons.find(node => node.textContent === "Provider center")!.click());
    expect(fixture.push).toHaveBeenCalledExactlyOnceWith("/tools/providers"); expect(fixture.mutate).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
