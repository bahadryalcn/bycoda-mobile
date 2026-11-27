// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { assistantProfileDefaults } from "../../../../host/assistant/profile-defaults";

const page = vi.hoisted(() => ({
  machine: { id: "host-a", name: "Work computer" } as { id: string; name: string } | undefined,
  query: {} as Record<string, unknown>,
  setPresence: vi.fn(async () => {}),
  invalidate: vi.fn(async () => {}),
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("expo-router", () => ({ router: { navigate: vi.fn(), push: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace(/\{(p\d+)\}/g, (_, key: string) => String(values?.[key] ?? key)) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: vi.fn() }));
vi.mock("@/ui/info-hint", () => ({ InfoHint: ({ text }: { text: string }) => h("span", null, text) }));
vi.mock("@/ui/limit-presets", () => ({ MinuteLimitField: ({ label }: { label: string }) => h("span", { "data-field": label }, label) }));
vi.mock("@/ui/error-message", () => ({ remoteErrorKind: (error: unknown) => (error as { kind?: string } | null)?.kind ?? null }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => page.machine,
  useMachines: (select: (state: object) => unknown) => select({ hydrated: true, connectionPending: false, storageError: null }),
}));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ token: "epoch-a", review: { environmentId: "env-a" }, isCurrent: () => true }) }));
vi.mock("@/state/queries", () => ({ useHostClient: () => ({}), useHostReadActive: () => true, hostKey: (id: string, parts: unknown[]) => [id, ...parts] }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: page.invalidate, setQueryData: vi.fn() }),
  useQuery: () => ({ refetch: vi.fn(async () => ({})), ...page.query }),
}));
vi.mock("../workspace/use-project-directory", () => ({ useProjectList: () => ({ directoryReady: true, data: [] }) }));
vi.mock("./assistant-client", () => ({
  AssistantMobileClient: class {
    setPresence = page.setPresence;
    notificationTargets = async () => [];
    inspectPresence = vi.fn();
    updateProfile = vi.fn();
  },
}));
vi.mock("../settings/settings-page", () => ({
  SettingsPage: ({ title, scope, children }: PropsWithChildren<{ title: string; scope?: { computer?: string } }>) =>
    h("main", { "aria-label": title, "data-computer": scope?.computer }, children),
}));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => h("div", null, children);
  const field = ({ label, value, options, onChange, disabled }: {
    label: string; value?: string; disabled?: boolean; options?: { value: string; label: string }[]; onChange?(value: string): void;
  }) => h("select", { "aria-label": label, value, disabled, onChange: (event: { target: { value: string } }) => onChange?.(event.target.value) },
    ...(options ?? []).map(option => h("option", { key: option.value, value: option.value }, option.label)));
  return {
    Body: Group, Stack: Group, NavigationGroup: Group,
    Section: ({ title, children }: PropsWithChildren<{ title: string }>) => h("section", null, h("h2", null, title), children),
    SelectField: field,
    MultiSelectField: ({ label }: { label: string }) => h("span", { "data-field": label }, label),
    ToggleField: ({ label }: { label: string }) => h("span", { "data-field": label }, label),
    NavigationRow: ({ label }: { label: string }) => h("span", { "data-field": label }, label),
    StatusText: ({ label }: { label: string }) => h("span", null, label),
    Notice: ({ message }: { message: string }) => h("p", null, message),
    ErrorNotice: () => h("p", null, "error"),
    ValueRow: ({ label }: { label: string }) => h("span", { "data-field": label }, label),
    showToast: vi.fn(),
    Button: ({ label }: { label: string }) => h("button", null, label),
    FormActions: ({ submitLabel, feedback }: { submitLabel: string; feedback?: ReactNode }) => h("footer", null, feedback, submitLabel),
    StateView: ({ title }: { title: string }) => h("p", { "data-state": title }, title),
    QueryState: () => h("div", { "data-query-state": true }),
  };
});
import { AssistantSettingsPage } from "./assistant-settings-page";

const snapshot = {
  profile: { ...assistantProfileDefaults, version: 3, permissionLevel: "ask" as const },
  presence: { state: "present" },
  effectivePresence: "idle",
};
let container: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  page.machine = { id: "host-a", name: "Work computer" };
  page.query = { data: { snapshot }, isPending: false };
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
const render = () => act(async () => root.render(h(AssistantSettingsPage)));

// The assistant's ⚙ sheet held status, notifications, the computer and access; they now live on this
// page, scoped to the selected computer.
it("shows status, notifications, the computer and access for the selected computer", async () => {
  await render();
  expect(container.querySelector("main")?.getAttribute("aria-label")).toBe("Assistant");
  expect(container.querySelector("main")?.getAttribute("data-computer")).toBe("Work computer");
  expect([...container.querySelectorAll("h2")].map(node => node.textContent)).toEqual(["Status", "Notifications", "Computer", "Access"]);
  for (const label of ["My presence", "Repeat urgent notifications", "Permission level"])
    expect(container.querySelector(`[aria-label="${label}"]`), label).not.toBeNull();
  for (const label of ["Repeat interval", "Telegram notification destination", "Keep the computer awake while away", "Always ask separately"])
    expect(container.querySelector(`[data-field="${label}"]`), label).not.toBeNull();
  expect(container.textContent).toContain("Right now: Idle");
  // Scope and the reply model belong to a conversation and stay in the assistant's sheet.
  expect(container.querySelector('[aria-label="Scope"]')).toBeNull();
});

it("changes the presence and reads the snapshot again", async () => {
  await render();
  await act(async () => {
    const node = container.querySelector<HTMLSelectElement>('select[aria-label="My presence"]')!;
    node.value = "away";
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(page.setPresence).toHaveBeenCalledWith("away");
  expect(page.invalidate).toHaveBeenCalledWith({ queryKey: ["host-a", "assistant", "epoch-a", "snapshot"] });
});

it("asks for a computer when none is connected", async () => {
  page.machine = undefined;
  await render();
  expect(container.querySelector("main")?.getAttribute("data-computer")).toBeNull();
  expect(container.querySelector('[data-state="Connect a computer first"]')).not.toBeNull();
  expect(container.querySelector("h2")).toBeNull();
});

it("asks to update bycoda when the computer does not offer the assistant", async () => {
  page.query = { error: { kind: "unsupported" }, isPending: false };
  await render();
  expect(container.querySelector('[data-state="Update bycoda on your computer"]')).not.toBeNull();
  expect(container.querySelector("[data-query-state]")).toBeNull();
  expect(container.querySelector("h2")).toBeNull();
});
