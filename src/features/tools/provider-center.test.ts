// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderCenter, orderProviders } from "./provider-center";
vi.mock("@/ui/no-computer", () => ({ NoComputerState: () => createElement("p", null, "Connect a computer first"), NoComputerGate: () => createElement("p", null, "Connect a computer first") }));
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }), HintSection: ({ children }: PropsWithChildren) => createElement("div", null, children), InfoHint: () => null, InfoPanel: () => null, HintLabel: () => null, UnitHint: () => null, isUnitHint: () => false }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
const state = vi.hoisted(() => ({ id: "machine", endpoint: "https://original.example", uncertain: false, revision: "a".repeat(64), requests: [] as { method: string; params: unknown }[], methods: [] as string[] }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.id, environmentId: "host", endpoint: state.endpoint, name: "Computer", capabilities: ["providers.center.read"] }), useMachines: { getState: () => ({ activeId: state.id, machines: [{ id: state.id, environmentId: "host", endpoint: state.endpoint }] }) } }));
vi.mock("@/state/queries", () => ({
  useHostQuery: (_key: unknown, method: string) => { state.methods.push(method); return { data: { environmentId: "host", sampledAt: 42, providers: [{ id: "claude", label: "Claude", launcher: "resolved", accountState: "desktop-only" }], acp: { revision: state.revision, agents: [{ id: "fixture", name: "Fixture agent", argumentCount: 2, environmentKeyCount: 1 }] } }, refetch: vi.fn() }; },
  useHostMutation: (method: string) => ({ isPending: false, mutateAsync: async (params: unknown) => { state.requests.push({ method, params }); if (state.uncertain) throw { uncertain: true }; } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { accent: "#000" } }) }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/bot", () => ({ default: () => null }));
vi.mock("@/ui/agent-avatar", () => ({ ProviderAccountMark: ({ provider }: { provider: string }) => createElement("i", null, provider) }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label);
  return { StatusRow: ({label,children}: import("react").PropsWithChildren<{label:string}>) => createElement("div", null, label, children),
    Disclosure: Wrapper, NavigationGroup: Wrapper, RowIcon: () => null,
    ValueRow: ({ label, value, trailing }: { label: string; value?: string; trailing?: import("react").ReactNode }) => createElement("div", null, label, value, trailing),
    Row: Wrapper, Section: ({ title, children }: { title: string; children: import("react").ReactNode }) => createElement("section", null, title, children), SectionHeader: ({ title, count }: { title: string; count?: number }) => createElement("h3", null, count === undefined ? title : title + " (" + count + ")"),
    StateView: ({ title, description }: { title: string; description?: string }) => createElement("p", null, title, description), IconButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { "aria-label": label, onClick: onPress, disabled }), Badge: ({ label }: { label: string }) => createElement("span", null, label),
    useCollapsibleSearch: (field: unknown) => ({ trigger: null, field, sheet: field, open: false }),
    SearchField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) => createElement("input", { "aria-label": label, value, onChange: (event: import("react").ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value) }),
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: { submitLabel: string; onSubmit: () => void; disabled?: boolean; busy?: boolean; feedback?: import("react").ReactNode }) => createElement("div", null, feedback, createElement("button", { disabled: disabled || busy, onClick: onSubmit }, submitLabel === "Review changes" ? submitLabel : "Confirm save")), Body: Wrapper, Sheet: Wrapper, QueryState: () => null, ErrorText: () => null, MutationState: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message), Button, NavigationRow: Button,
    Field: ({ label, value, editable, onChangeText }: { label: string; value: string; editable: boolean; onChangeText: (text: string) => void }) => createElement("input", { 'aria-label': label, value, disabled: !editable, onChange: (event: import("react").ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value) }),
    ScreenList: ({ header, data, renderItem }: { header: import("react").ReactNode; data: unknown[]; renderItem: (value: { item: unknown }) => import("react").ReactNode }) => createElement("div", null, header, ...data.map((item) => renderItem({ item }))),
  };
});
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); if (!root) { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); } await act(async () => root!.render(createElement(ProviderCenter))); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); state.id = "machine"; state.endpoint = "https://original.example"; state.requests = []; state.methods = []; state.revision = "a".repeat(64); state.uncertain = false; vi.unstubAllGlobals(); });
it("shows the normal launcher state as quiet text, problems first, and the ACP count without brackets", async () => {
  await render();
  expect(container.textContent).toContain("ClaudeAvailable");
  expect(container.querySelector("h3")?.textContent).toBe("Agents on this computer (1)");
  expect(container.textContent).not.toContain("Custom ACP agents (0)");
});
it("orders unavailable launchers first and keeps the computer order otherwise", () => {
  const providers = [{ id: "a", launcher: "resolved" }, { id: "b", launcher: "unavailable" }, { id: "c", launcher: "unknown" }] as unknown as Parameters<typeof orderProviders>[0];
  expect(orderProviders(providers).map((provider) => provider.id)).toEqual(["b", "a", "c"]);
});
it("reads only the safe method and lists ACP agents read-only", async () => {
  await render(); expect(state.methods).toEqual(["providers.center.read"]);
  expect(container.textContent).toContain("Fixture agent");
  // Agent configuration is desktop-only: no row opens an editor and nothing is written.
  expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Fixture agent")).toBe(false);
  expect(container.querySelector('input[aria-label="Name"]')).toBeNull();
  expect(state.requests).toEqual([]);
});
