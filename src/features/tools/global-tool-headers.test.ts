// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  supported: true, fetching: false, refetch: vi.fn(), mutate: vi.fn(),
  options: [] as { title?: string }[], enabled: undefined as boolean | undefined,
  pull: undefined as undefined | (() => unknown),
}));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("expo-router", () => ({ Stack: { Screen: ({ options }: { options: { title?: string } }) => { fixture.options.push(options); return null; } } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "machine", environmentId: "env", name: "Computer", capabilities: fixture.supported ? ["providers.center.read", "host.access.read"] : [] }),
  useMachines: { getState: () => ({ activeId: "machine", machines: [{ id: "machine", environmentId: "env" }] }) },
}));
vi.mock("./access-device", () => ({ AccessDevice: () => null }));
vi.mock("./access-tunnels", () => ({ AccessTunnels: () => null }));
vi.mock("@/state/queries", () => ({
  useHostMutation: () => ({ mutateAsync: fixture.mutate }),
  useHostQuery: (_key: unknown, method: string, _params: unknown, options: { enabled: boolean }) => {
    fixture.enabled = options.enabled;
    const data = method === "providers.center.read"
      ? { providers: [], acp: { revision: "revision", agents: [{ id: "searchable-id", name: "Fixture agent" }] } }
      : { devices: [], tunnels: null, lan: { state: "ready" }, privateNetwork: { state: "offline" } };
    return { data, isSuccess: true, isFetching: fixture.fetching, refetch: fixture.refetch };
  },
}));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled, busy }: any) => createElement("button", { onClick: onPress, disabled: disabled || busy }, label);
  return { StatusRow: ({label,children}: import("react").PropsWithChildren<{label:string}>) => createElement("div", null, label, children), Body: Wrap, Disclosure: Wrap, Row: Wrap, Button, NavigationRow: Button, Badge: ({ label }: any) => createElement("span", null, label),
    Notice: ({ message }: any) => createElement("p", null, message), QueryState: () => null,
    ScreenList: ({ title, actions, header, data, renderItem, query, refreshState }: any) => { fixture.pull = refreshState?.onRefresh ?? query?.refetch; return createElement("main", null, title, actions, header, ...data.map((item: unknown, i: number) => createElement("div", { key: i }, renderItem({ item })))); },
    SearchField: ({ label, value, onChangeText }: any) => createElement("input", { "aria-label": label, value, onChange: (event: any) => onChangeText(event.target.value) }),
    Empty: ({ title, action }: any) => createElement("div", null, title, action ? createElement(Button, { label: action.label, onPress: action.onPress }) : null),
    Field: () => null, FormActions: () => null, MutationState: () => null, ErrorText: () => null, Sheet: Wrap,
  };
});
import { AccessCenter } from "./access-center";
import { ProviderCenter } from "./provider-center";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
async function render(node: ReactNode) { await act(async () => root.render(node)); }
function button(label: string) { return [...container.querySelectorAll("button")].find((button) => button.textContent === label)!; }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fixture.supported = true; fixture.fetching = false; fixture.options.length = 0;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
for (const [name, Component] of [["Host access", AccessCenter], ["Provider center", ProviderCenter]] as const) {
  it(`${name} owns its native title and one heading refresh, with the same read owner for pull`, async () => {
    await render(createElement(Component));
    expect(fixture.options.some((options) => options.title === name)).toBe(true);
    expect([...container.querySelectorAll("button")].filter((button) => button.textContent === "Refresh")).toHaveLength(1);
    expect(fixture.pull).toBeTypeOf("function");
    await act(async () => button("Refresh").click()); expect(fixture.refetch).toHaveBeenCalledOnce(); expect(fixture.mutate).not.toHaveBeenCalled();
    fixture.fetching = true; await render(createElement(Component)); expect(button("Refresh").disabled).toBe(true);
  });
  it(`${name} exposes no pull/read action when unsupported`, async () => {
    fixture.supported = false; await render(createElement(Component));
    expect(fixture.enabled).toBe(false); expect(fixture.pull).toBeUndefined(); expect(button("Refresh").disabled).toBe(true);
    expect(fixture.refetch).not.toHaveBeenCalled(); expect(fixture.mutate).not.toHaveBeenCalled();
  });
}
it("provider filtering distinguishes no matches and recovers the unchanged agent collection", async () => {
  await render(createElement(ProviderCenter));
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Search agents"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(input, "missing"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  expect(container.textContent).toContain("No matching results"); expect(container.textContent).not.toContain("No configured ACP agents.");
  await act(async () => button("Clear search").click()); expect(input.value).toBe(""); expect(button("Fixture agent")).toBeDefined();
  expect(fixture.mutate).not.toHaveBeenCalled();
});
