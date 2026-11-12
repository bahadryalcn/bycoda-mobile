import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ options: [] as { enabled?: boolean }[], keys: [] as unknown[] }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/users", () => ({ default: () => null }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/primitives", () => ({ PressableCard: ({ children, label }: PropsWithChildren<{ label: string }>) => createElement("button", { "aria-label": label }, children) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, v?: Record<string, unknown>) => en.replace("{p0}", String(v?.p0)) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/tokens", () => ({ fontSize: {}, lineHeight: {}, radii: {}, space: {} }));
vi.mock("@/state/queries", () => ({
  useHostClient: () => ({}),
  useHostQuery: (key: unknown, _m: string, _p: unknown, options: { enabled?: boolean }) => {
    state.keys.push(key);
    state.options.push(options);
    return { data: undefined };
  },
}));
vi.mock("./subagent-sessions-model", () => ({ childSessions: () => [] }));
vi.mock("./agents-sheet", () => ({ AgentsSheet: () => null }));
vi.mock("./run-status-card", () => ({ RunStatusCard: () => null }));
import { SessionAgents } from "./session-agents";

const session = (blocks: unknown[], status = "idle") =>
  ({ projectId: "p", status, runId: "r", session: { blocks, cwd: "/", harness: "codex" } }) as never;
const props = { scope: { machineId: "m", sessionId: "s" }, disabled: false, onCommand: () => {} } as never;
beforeEach(() => Object.assign(state, { options: [], keys: [] }));

it("shares the sessions-panel list key and only fetches it when the session used subagents", () => {
  renderToStaticMarkup(createElement(SessionAgents, { ...(props as object), session: session([{ id: "a", role: "assistant", text: "hi" }]), children: () => null } as never));
  expect(state.keys[0]).toEqual(["sessions", "p"]);
  expect(state.options[0]!.enabled).toBe(false);
  renderToStaticMarkup(createElement(SessionAgents, { ...(props as object), session: session([{ id: "a", role: "tool", text: "", agentRun: { name: "x" } }]), children: () => null } as never));
  expect(state.options[1]!.enabled).toBe(true);
});

it("hands the idle agents chip to the transcript instead of rendering it above the list", () => {
  const html = renderToStaticMarkup(createElement(SessionAgents, {
    ...(props as object),
    session: session([{ id: "a", role: "tool", text: "", agentRun: { name: "x" } }]),
    children: (chip: unknown) => createElement("section", null, chip as never),
  } as never));
  expect(html).toMatch(/^<section>.*1 agents.*<\/section>/);
});
