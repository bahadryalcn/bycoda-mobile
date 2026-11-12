// @vitest-environment happy-dom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  id: "machine", endpoint: "https://synthetic.invalid", environmentId: "host", lanKey: "synthetic", projectId: "project", hideHeader: false,
  start: vi.fn(async (_params: unknown): Promise<any> => ({})), submit: undefined as any,
}));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/server", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/tokens", () => ({ colors: {} }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: fixture.id, name: "Computer", endpoint: fixture.endpoint, environmentId: fixture.environmentId, lanKey: fixture.lanKey });
  return { useActiveMachine: machine, useMachines: { getState: () => ({ activeId: fixture.id, machines: [machine()] }) } };
});
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({ data: { status: "ok", servers: [{ id: "web", projectId: fixture.projectId, name: "Web", state: "running", endpoints: [] }] }, isSuccess: true }),
  useHostMutation: () => ({ mutateAsync: fixture.start, reset: vi.fn() }),
}));
function Detail() {
  const [value, setValue] = useState(""); return createElement("input", { "aria-label": "Detail draft", value, onChange: (e: any) => setValue(e.target.value) });
}
vi.mock("./dev-server-detail", () => ({ DevServerDetail: Detail }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled }: any) => createElement("button", { onClick: onPress, disabled }, label);
  return { Body: Group, Row: Group, Badge: () => null, MutationState: () => null, QueryState: () => null, Notice: () => null, IconButton: Button, NavigationRow: Button,
    ErrorText: ({ error }: any) => error ? createElement("p", null, error.message) : null,
    SearchField: () => null,
    Field: ({ label, value, onChangeText }: any) => createElement("input", { "aria-label": label, value, onChange: (e: any) => onChangeText(e.target.value) }),
    Sheet: ({ visible, children }: any) => visible ? createElement("aside", null, children) : null,
    FormActions: ({ submitLabel, onSubmit, feedback }: any) => { fixture.submit = onSubmit; return createElement("div", null, feedback, createElement(Button, { label: `Submit ${submitLabel}`, onPress: onSubmit })); },
    ScreenList: ({ header, actions, data, renderItem }: any) => createElement("main", null, actions, fixture.hideHeader ? null : header, data.map((item: any) => createElement("div", { key: item.id }, renderItem({ item })))),
  };
});
import { DevServersScreen } from "./dev-servers-screen";
let root: ReturnType<typeof createRoot>, node: HTMLDivElement;
const render = () => act(() => root.render(createElement(DevServersScreen, { project: { id: fixture.projectId, name: "Project", cwd: "/project" } as any })));
const click = async (label: string) => { const b = [...node.querySelectorAll("button")].find(e => e.textContent === label)!; expect(b).toBeTruthy(); await act(() => b.click()); };
const input = async (label: string, value: string) => { const field = node.querySelector(`input[aria-label="${label}"]`)!; await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); }); };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fixture.id = "machine"; fixture.endpoint = "https://synthetic.invalid"; fixture.environmentId = "host"; fixture.lanKey = "synthetic"; fixture.projectId = "project"; fixture.hideHeader = false;
  fixture.start.mockReset().mockResolvedValue({}); node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(() => { act(() => root.unmount()); node.remove(); vi.unstubAllGlobals(); });
it.each(["create", "detail"])("keeps %s state and native-field identity outside a removed list header", async kind => {
  await render(); await click(kind === "create" ? "Start server" : "Web"); const label = kind === "create" ? "Name" : "Detail draft";
  await input(label, "Retained editor state"); const field = node.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement; field.focus();
  fixture.hideHeader = true; await render(); expect(node.querySelector(`input[aria-label="${label}"]`)).toBe(field); expect(field.value).toBe("Retained editor state"); expect(document.activeElement).toBe(field);
});
it.each(["machine", "endpoint", "environment", "key", "project"])("rejects an old start callback after a %s change", async kind => {
  await render(); await click("Start server"); await input("Command", "pnpm dev"); const stale = fixture.submit;
  if (kind === "machine") fixture.id = "other";
  if (kind === "endpoint") fixture.endpoint = "https://repaired.invalid";
  if (kind === "environment") fixture.environmentId = "other";
  if (kind === "key") fixture.lanKey = "other-synthetic";
  if (kind === "project") { fixture.projectId = "other-project"; await render(); }
  await act(() => stale()); expect(fixture.start).not.toHaveBeenCalled(); await render(); expect(node.querySelector("aside")).toBeNull();
});
it("keeps the new target's editor when an old start response arrives late", async () => {
  let finish!: (value: any) => void; fixture.start.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(); await click("Start server"); await input("Command", "pnpm old"); await click("Submit Start server"); fixture.projectId = "new-project"; await render();
  await click("Start server"); await input("Command", "pnpm new");
  await act(async () => finish({ server: { id: "old-result", projectId: "project", endpoints: [] } }));
  expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe("pnpm new"); expect(node.querySelector('input[aria-label="Detail draft"]')).toBeNull();
});
it("retains the form and reports a start response from another project", async () => {
  fixture.start.mockResolvedValue({ server: { id: "foreign", projectId: "foreign-project", endpoints: [] } });
  await render(); await click("Start server"); await input("Command", "pnpm kept"); await click("Submit Start server");
  expect(node.textContent).toContain("does not belong to this project"); expect((node.querySelector('input[aria-label="Command"]') as HTMLInputElement).value).toBe("pnpm kept"); expect(node.querySelector('input[aria-label="Detail draft"]')).toBeNull();
});
