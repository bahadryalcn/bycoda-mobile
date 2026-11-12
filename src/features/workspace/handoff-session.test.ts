// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { HostSession } from "@/domain/types";
import { UncertainCommand } from "./commands";
import { HandoffSession } from "./handoff-session";
const state = vi.hoisted(() => ({ activeId: "m", dispatch: vi.fn(async (_params: unknown) => ({ commandId: "ctx", sessionId: "destination", revision: 1 })), push: vi.fn(), previews: [] as unknown[] }));
vi.mock("expo-router", () => ({ router: { push: state.push } }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "m", providers: ["codex", "claude"], capabilities: ["sessions.contextual"] }), useMachines: { getState: () => ({ activeId: state.activeId }) } }));
vi.mock("@/state/model-catalog", () => ({ useModelCatalog: () => ({ data: { models: { claude: [{ id: "claude:test", name: "Claude", settings: [] }], codex: [] } }, isPending: false }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: (_key: unknown, _method: unknown, params: Record<string, unknown>, options: { enabled: boolean }) => {
  if (options.enabled) state.previews.push(params);
  return { data: options.enabled ? { ...params, digest: "a".repeat(64), account: "host-default", projectId: "p", cwd: "/source", runtimeMode: "supervised", sourceProvider: "codex", contextText: "Exact reviewed context", files: [] } : undefined,
    error: null, isFetching: false, refetch: vi.fn() };
} }));
vi.mock("./session-queries", () => ({ useEarlierSession: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: ({ onClose }: { onClose: () => void }) => ({ requestClose: onClose }) }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => createElement("p", null, text) }));
vi.mock("./handoff-delivery", async () => {
  const { useState } = await import("react");
  return { useContextualDelivery: () => {
      const [error, setError] = useState<Error | null>(null);
      const [receipt, setReceipt] = useState<null | { commandId: string; sessionId: string; revision: number }>(null);
      return { error, loading: false, receipt, isPending: false, reset: () => setError(null), acceptRecovered: async (value: { commandId: string; sessionId: string; revision: number }) => { setReceipt(value); setError(null); }, mutateAsync: async (params: unknown) => {
        try { const value = await state.dispatch(params); setReceipt(value); return value; } catch (cause) { setError(cause as Error); throw cause; }
      } };
    } };
});
vi.mock("./shared", async () => {
  const { UncertainCommand } = await import("./commands");
  return { UncertainCommand,
    CommandError: ({ error, onRecovered }: { error: unknown; onRecovered: (value: { commandId: string; sessionId: string; revision: number }) => void }) => error ? createElement("div", null, String(error),
      createElement("button", { onClick: () => onRecovered({ commandId: "ctx", sessionId: "destination", revision: 1 }) }, "Check status")) : null,
  };
});
vi.mock("@/ui/primitives", () => {
  const content = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) => createElement("button", { onClick: onPress, disabled: disabled || busy }, label);
  return { Body: content, Stack: content, Disclosure: content, QueryState: () => null, MutationState: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message), StateView: ({ title }: { title: string }) => createElement("p", null, title), Button: button,
    SelectField: ({ label, value, options, onChange, disabled }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled: boolean }) =>
      createElement("select", { "aria-label": label, value, disabled, onChange: (event) => onChange((event.currentTarget as HTMLSelectElement).value) },
        createElement("option", { value: "" }, "Choose"), ...options.map((option) => createElement("option", { key: option.value, value: option.value }, option.label))),
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: { submitLabel: string; onSubmit: () => void; disabled: boolean; busy: boolean; feedback?: ReactNode }) =>
      createElement("div", null, button({ label: submitLabel, onPress: onSubmit, disabled, busy }), feedback),
  };
});
const source = { projectId: "p", revision: 5, status: "idle", session: { id: "source", harness: "codex", model: "codex:test", blocks: [{ id: "u", role: "user", text: "Request" }, { id: "a", role: "assistant", text: "Reply" }] } } as HostSession;
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(HandoffSession, { scope: { machineId: "m", sessionId: "source" }, source, mode: "handoff", blocked: false, onClose: vi.fn() })));
}
async function choose(label: string, value: string) {
  await act(async () => { const select = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement; select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
async function review() { await choose("Target agent", "claude"); await choose("Target model", "claude:test"); await click("Review outgoing context"); }
afterEach(async () => { await act(async () => root?.unmount()); vi.clearAllMocks(); vi.unstubAllGlobals(); state.activeId = "m"; state.previews = []; });
it("opening does not preview or dispatch; exact reviewed context precedes one explicit creation", async () => {
  await mount();
  expect(state.previews).toHaveLength(0); expect(state.dispatch).not.toHaveBeenCalled();
  await review();
  expect(container.textContent).toContain("Exact reviewed context"); expect(state.dispatch).not.toHaveBeenCalled();
  await click("Prepare continuation session");
  expect(state.dispatch).toHaveBeenCalledExactlyOnceWith({ type: "contextual", sessionId: "source", sourceBlockId: "a", expectedRevision: 5,
    mode: "handoff", harness: "claude", model: "claude:test", modelSettings: {}, previewDigest: "a".repeat(64) });
  expect(state.push).not.toHaveBeenCalled();
  await click("Open new session"); expect(state.push).toHaveBeenCalledOnce();
});
it("never retargets a machine change or replays unknown creation; reconciliation opens the original result", async () => {
  state.dispatch.mockRejectedValueOnce(new UncertainCommand("original", "m", { machine: { id: "m" }, request: vi.fn() } as never));
  await mount(); await review();
  state.activeId = "other"; await click("Prepare continuation session"); expect(state.dispatch).not.toHaveBeenCalled();
  state.activeId = "m"; await click("Prepare continuation session");
  await click("Prepare continuation session"); expect(state.dispatch).toHaveBeenCalledTimes(1);
  await click("Check status"); expect(state.dispatch).toHaveBeenCalledTimes(1);
  await click("Open new session"); expect(state.push).toHaveBeenCalledWith({ pathname: "/session/[id]", params: { id: "destination", machineId: "m", projectId: "p" } });
});
