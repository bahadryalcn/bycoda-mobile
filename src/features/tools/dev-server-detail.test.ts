// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DevServerDetail } from "./dev-server-detail";
vi.mock("@/ui/message-code", () => ({ MessageCode: ({ code }: { code: string }) => createElement("pre", null, code) }));
const state = vi.hoisted(() => ({ id: "machine", endpoint: "https://synthetic.invalid", environmentId: "host", lanKey: "synthetic", requests: [] as { method: string; params: unknown }[],
  detailError: null as Error | null, logsError: null as Error | null, logsAvailable: false, logOutput: "Synthetic output", fetching: false, returnedId: "web", reviewCapability: true, submit: undefined as undefined | (() => void), uncertain: false, force: false, refetch: vi.fn(async () => ({ isError: false })) }));
const server = { id: "web", projectId: "project", managed: true, association: "managed" as const, name: "Web", state: "running" as const,
  endpoints: [{ address: "127.0.0.1", port: 3000, url: "http://127.0.0.1:3000" }], logsAvailable: false,
  process: { pid: 101, startedAt: "birth", name: "node" } };
vi.mock("@/state/machines", () => ({
  useMachines: Object.assign((fn: (value: { activeId: string }) => unknown) => fn({ activeId: state.id }), { getState: () => ({ activeId: state.id, machines: [{ id: state.id, endpoint: state.endpoint, environmentId: state.environmentId, lanKey: state.lanKey }] }) }),
  useActiveMachine: () => ({ id: state.id, name: "Computer", endpoint: state.endpoint, environmentId: state.environmentId, lanKey: state.lanKey, capabilities: ["browser.shared", ...(state.reviewCapability ? ["dev.servers.reviewed-impact"] : [])] }),
}));
vi.mock("@/ui/layout", () => ({ ScreenChromeProvider: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("./browser-screen", () => ({ BrowserScreen: ({ initialUrl }: any) => createElement("div", { "data-browser-url": initialUrl }) }));
vi.mock("@/state/queries", () => ({
  useHostQuery: (_key: unknown, method: string) => method === "devServers.logs" ? { data: { available: state.logsAvailable, output: state.logOutput }, error: state.logsError, isSuccess: !state.logsError, refetch: state.refetch } : ({ data: { server: { ...server, id: state.returnedId, logsAvailable: true }, descendants: [{ pid: 102, startedAt: "child", name: "worker" }], affectedPorts: [3000], expectedImpact: "b".repeat(64) }, error: state.detailError, isFetching: state.fetching, isSuccess: !state.detailError, refetch: state.refetch }),
  useHostMutation: (method: string) => ({ isPending: false, reset: () => {}, data: method === "devServers.stop" && state.force ? { requiresForce: true } : undefined,
    mutateAsync: async (params: unknown) => { state.requests.push({ method, params }); if (state.uncertain) throw { uncertain: true }; return { requiresForce: true }; } }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: { caption: {} } }) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label);
  return {
    Disclosure: Wrapper, ScopeLine: () => null,
    ValueRow: ({ label, value }: { label: string; value?: string }) => createElement("p", null, `${label}: ${value ?? ""}`),
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: { submitLabel: string; onSubmit: () => void; disabled?: boolean; busy?: boolean; feedback?: import("react").ReactNode }) => { state.submit = onSubmit; return createElement("div", null, feedback, createElement("button", { disabled: disabled || busy, onClick: onSubmit }, `Confirm ${submitLabel}`)); }, Body: Wrapper, Row: Wrapper, Sheet: Wrapper, NavigationGroup: Wrapper, CodePanel: Wrapper, CodeText: Wrapper,
    Button, QueryState: ({ query }: any) => query.error ? createElement("p", null, query.error.message) : null, MutationState: () => null, ErrorText: () => null, ToggleField: () => null,
    StateView: ({ title, description }: any) => createElement("p", null, title, description), StatusLine: ({ label }: any) => createElement("p", null, label), Notice: ({ message, onRetry }: any) => createElement("div", null, message, onRetry ? createElement(Button, { label: "Retry", onPress: onRetry }) : null),
  };
});
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render(projectId = "project") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { container = document.createElement("div"); root = createRoot(container); }
  await act(async () => root!.render(createElement(DevServerDetail, { projectId, project: { id: projectId, name: "Project", cwd: "/project" }, server, onClose: vi.fn() })));
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
  await act(async () => button.click());
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.requests = []; state.id = "machine"; state.endpoint = "https://synthetic.invalid"; state.environmentId = "host"; state.lanKey = "synthetic"; state.uncertain = false; state.force = false; state.detailError = null; state.logsError = null; state.logsAvailable = false; state.logOutput = "Synthetic output"; state.fetching = false; state.returnedId = "web"; state.reviewCapability = true; state.refetch.mockReset().mockResolvedValue({ isError: false }); vi.unstubAllGlobals(); });
it("shows exact process/port impact before force and sends the frozen review token only on confirmation", async () => {
  state.force = true; await render(); await click("Force stop");
  expect(state.requests).toEqual([]);
  expect(container.textContent).toContain("PID 102"); expect(container.textContent).toContain("3000");
  await click("Confirm Force stop");
  expect(state.requests).toEqual([{ method: "devServers.kill", params: { projectId: "project", id: "web", tree: true,
    identity: { pid: 101, startedAt: "birth" }, expectedImpact: "b".repeat(64) } }]);
});
it("rejects confirmation after machine change", async () => {
  await render(); await click("Stop"); state.id = "other"; await click("Confirm Stop");
  expect(state.requests).toEqual([]);
});
it("does not resend uncertain writes until explicit successful state reconciliation", async () => {
  state.uncertain = true; await render(); await click("Stop"); await click("Confirm Stop");
  expect(state.requests).toHaveLength(1); expect(container.textContent).toContain("outcome is unknown");
  await click("Confirm Stop"); expect(state.requests).toHaveLength(1);
  await click("Refresh state"); state.uncertain = false; await click("Stop"); await click("Confirm Stop");
  expect(state.requests).toHaveLength(2);
});
it.each(["endpoint", "environment", "key", "project"])("invalidates a reviewed %s change after rerender and never revives its approval", async kind => {
  await render(); await click("Stop"); const stale = state.submit!;
  if (kind === "endpoint") state.endpoint = "https://repaired.invalid";
  if (kind === "environment") state.environmentId = "other";
  if (kind === "key") state.lanKey = "other-synthetic";
  await render(kind === "project" ? "other-project" : "project"); await act(() => stale());
  expect(state.requests).toEqual([]); expect(container.textContent).toContain("Reopen this view");
  state.endpoint = "https://synthetic.invalid"; state.environmentId = "host"; state.lanKey = "synthetic"; await render();
  expect(container.textContent).toContain("Reopen this view"); expect(state.requests).toEqual([]);
});
it("does not add unavailable-log feedback beside a log read failure", async () => {
  await render(); await click("Logs"); state.logsError = new Error("Synthetic log read failure"); await render();
  expect(container.textContent).toContain("Synthetic log read failure"); expect(container.textContent).not.toContain("Logs are not available");
  state.logsError = null; await render(); expect(container.textContent).toContain("Logs are not available");
});
it("rejects a wrong server identity and provides contextual refresh", async () => {
  state.returnedId = "other-server"; await render(); expect(container.textContent).toContain("do not match this target");
  expect([...container.querySelectorAll("button")].some(b => b.textContent === "Stop")).toBe(false);
  await click("Retry"); expect(state.refetch).toHaveBeenCalledOnce(); expect(state.requests).toEqual([]);
});
it("coalesces explicit refresh and blocks an outstanding review while the read reconciles", async () => {
  let finish!: () => void; state.refetch.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ isError: false }); }));
  await render(); await click("Stop"); const stale = state.submit!; await click("Refresh state"); await click("Refresh state"); await act(() => stale());
  expect(state.refetch).toHaveBeenCalledOnce(); expect(state.requests).toEqual([]); await act(async () => finish());
});
it("keeps private preview available without process-impact mutation capability", async () => {
  state.reviewCapability = false; await render(); await click("Preview");
  expect(container.querySelector("[data-browser-url]")?.getAttribute("data-browser-url")).toBe("http://127.0.0.1:3000/"); expect(state.requests).toEqual([]);
});
it("blocks review submission when details have lost read authority", async () => {
  await render(); await click("Stop"); state.detailError = new Error("Synthetic detail read failure"); await render(); await act(() => state.submit!());
  expect(state.requests).toEqual([]); expect(container.textContent).toContain("Synthetic detail read failure");
});

it("discloses bounded log output and does not split an emoji at the retained boundary", async () => {
  state.logsAvailable = true;
  // Put a multi-code-unit symbol at the exact old UTF-16 tail boundary.
  state.logOutput = "Earlier build output\n" + "👩🏽‍💻" + "Compiled Android bundle successfully\n".repeat(1000).slice(0, 31_999);
  await render(); await click("Logs");
  expect(container.textContent?.includes("Only the most recent output is shown.")).toBe(true);
  expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(container.textContent ?? "")).toBe(false);
  expect(state.requests).toEqual([]);
});
