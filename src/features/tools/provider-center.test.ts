// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderCenter } from "./provider-center";
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }), HintSection: ({ children }: PropsWithChildren) => createElement("div", null, children), InfoHint: () => null, InfoPanel: () => null, HintLabel: () => null, UnitHint: () => null, isUnitHint: () => false }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
const state = vi.hoisted(() => ({ id: "machine", endpoint: "https://original.example", uncertain: false, revision: "a".repeat(64), requests: [] as { method: string; params: unknown }[], methods: [] as string[] }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.id, environmentId: "host", endpoint: state.endpoint, name: "Computer", capabilities: ["providers.center.read", "providers.acp.patchMetadata"] }), useMachines: { getState: () => ({ activeId: state.id, machines: [{ id: state.id, environmentId: "host", endpoint: state.endpoint }] }) } }));
vi.mock("@/state/queries", () => ({
  useHostQuery: (_key: unknown, method: string) => { state.methods.push(method); return { data: { environmentId: "host", sampledAt: 42, providers: [{ id: "claude", label: "Claude", launcher: "resolved", accountState: "desktop-only" }], acp: { revision: state.revision, agents: [{ id: "fixture", name: "Fixture agent", argumentCount: 2, environmentKeyCount: 1 }] } }, refetch: vi.fn() }; },
  useHostMutation: (method: string) => ({ isPending: false, mutateAsync: async (params: unknown) => { state.requests.push({ method, params }); if (state.uncertain) throw { uncertain: true }; } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { accent: "#000" } }) }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("@/ui/agent-avatar", () => ({ ProviderAccountMark: ({ provider }: { provider: string }) => createElement("i", null, provider) }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label);
  return { StatusRow: ({label,children}: import("react").PropsWithChildren<{label:string}>) => createElement("div", null, label, children),
    Disclosure: Wrapper,
    Row: Wrapper, Section: ({ title, children }: { title: string; children: import("react").ReactNode }) => createElement("section", null, title, children), SectionHeader: ({ title, count }: { title: string; count?: number }) => createElement("h3", null, count === undefined ? title : title + " (" + count + ")"),
    StateView: ({ title, description }: { title: string; description?: string }) => createElement("p", null, title, description), IconButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { "aria-label": label, onClick: onPress, disabled }), Badge: ({ label }: { label: string }) => createElement("span", null, label),
    SearchField: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) => createElement("input", { "aria-label": label, value, onChange: (event: import("react").ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value) }),
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: { submitLabel: string; onSubmit: () => void; disabled?: boolean; busy?: boolean; feedback?: import("react").ReactNode }) => createElement("div", null, feedback, createElement("button", { disabled: disabled || busy, onClick: onSubmit }, submitLabel === "Review changes" ? submitLabel : "Confirm save")), Body: Wrapper, Sheet: Wrapper, QueryState: () => null, ErrorText: () => null, MutationState: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message), Button, NavigationRow: Button,
    Field: ({ label, value, editable, onChangeText }: { label: string; value: string; editable: boolean; onChangeText: (text: string) => void }) => createElement("input", { 'aria-label': label, value, disabled: !editable, onChange: (event: import("react").ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value) }),
    ConfirmationCard: ({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) => createElement(Button, { label: "Confirm save", onPress: onConfirm, disabled }),
    ScreenList: ({ header, data, renderItem }: { header: import("react").ReactNode; data: unknown[]; renderItem: (value: { item: unknown }) => import("react").ReactNode }) => createElement("div", null, header, ...data.map((item) => renderItem({ item }))),
  };
});
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); if (!root) { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); } await act(async () => root!.render(createElement(ProviderCenter))); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
async function editName() { const input = container.querySelector('input[aria-label="Name"]') as HTMLInputElement; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Renamed"); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); state.id = "machine"; state.endpoint = "https://original.example"; state.requests = []; state.methods = []; state.revision = "a".repeat(64); state.uncertain = false; vi.unstubAllGlobals(); });
it("reads only the safe method and confirms a frozen revision metadata patch", async () => {
  await render(); expect(state.methods).toEqual(["providers.center.read"]); expect(state.requests).toEqual([]);
  await click("Fixture agent"); await editName(); await click("Review changes");
  expect(state.requests).toEqual([]); state.revision = "b".repeat(64); await render(); await click("Confirm save");
  expect(state.requests).toEqual([{ method: "providers.acp.patchMetadata", params: { id: "fixture", expectedRevision: "a".repeat(64), name: "Renamed", contextWindow: null } }]);
});
it("does not revive an approval after a machine change", async () => {
  await render(); await click("Fixture agent"); await editName(); await click("Review changes");
  state.id = "other"; await click("Confirm save"); expect(state.requests).toEqual([]);
  state.id = "machine"; await click("Confirm save"); expect(state.requests).toEqual([]);
});

it("does not resend an uncertain save", async () => {
  await render(); await click("Fixture agent"); await editName(); await click("Review changes");
  state.uncertain = true; await click("Confirm save"); expect(state.requests).toHaveLength(1);
  expect(container.textContent).toContain("save outcome is unknown"); await click("Confirm save"); expect(state.requests).toHaveLength(1);
});

it("retires a metadata review when the same computer is paired through a new endpoint", async () => {
  await render(); await click("Fixture agent"); await editName(); await click("Review changes");
  state.endpoint = "https://replacement.example"; await click("Confirm save"); expect(state.requests).toEqual([]);
  state.endpoint = "https://original.example"; await click("Confirm save"); expect(state.requests).toEqual([]);
});
