// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AccessDevice } from "./access-device";
const state = vi.hoisted(() => ({ id: "machine", requests: [] as unknown[], uncertain: false, flush: vi.fn(async () => {}), remove: vi.fn(async () => {}), denyFlush: false }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: state.id, environmentId: "host", capabilities: ["devices.revokeOther"] }), useMachines: { getState: () => ({ activeId: state.id, machines: [{ id: state.id, environmentId: "host" }], removeMachine: state.remove }) } }));
vi.mock("@/state/security", () => ({ assertAppAccess: vi.fn() }));
vi.mock("@/features/workspace/draft-guard", () => ({ flushWorkspaceDrafts: () => { if (state.denyFlush) return Promise.reject(new Error("Draft persistence failed")); return state.flush(); } }));
vi.mock("@/state/queries", () => ({ useHostMutation: (method: string) => ({ isPending: false, reset: vi.fn(), mutateAsync: async (params: unknown) => { state.requests.push({ method, params }); if (state.uncertain) throw { uncertain: true }; return { revoked: true }; } }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => { const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label);
  return { Body: Wrapper, Disclosure: Wrapper, Sheet: Wrapper, ErrorText: () => null, MutationState: () => null, Notice: ({ message }: { message: string }) => createElement("p", null, message), Button,
    FormActions: ({ disabled, busy, onSubmit, submitLabel, feedback }: any) => createElement("div", null, feedback, createElement(Button, { label: submitLabel === "Revoke access" ? "Confirm revoke" : submitLabel, disabled: disabled || busy, onPress: onSubmit })) }; });
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render(self = false) { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); root = createRoot(container); await act(async () => root!.render(createElement(AccessDevice, { target: { machineId: "machine", environmentId: "host" }, device: { id: self ? "self" : "other", name: "Device", isCurrent: self }, onClose: vi.fn(), onUpdated: vi.fn() }))); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; state.id = "machine"; state.requests = []; state.uncertain = false; state.denyFlush = false; state.flush.mockClear(); state.remove.mockReset().mockResolvedValue(); vi.unstubAllGlobals(); });
it("revoke-other needs explicit confirmation and preserves this phone's credential", async () => {
  await render(); await click("Revoke device access"); expect(state.requests).toEqual([]); await click("Confirm revoke");
  expect(state.requests).toEqual([{ method: "devices.revokeOther", params: { id: "other" } }]); expect(state.remove).not.toHaveBeenCalled();
});
it("revoke-self flushes existing drafts then cleans only the originating local connection", async () => {
  await render(true); await click("Revoke this phone's access"); await click("Confirm revoke");
  expect(state.flush).toHaveBeenCalledOnce(); expect(state.requests).toEqual([{ method: "devices.revokeSelf", params: {} }]); expect(state.remove).toHaveBeenCalledExactlyOnceWith("machine", { id: "machine", environmentId: "host", endpoint: undefined, lanKey: undefined });
});
it("failed draft flush prevents self revoke, while uncertain writes never clean or resend", async () => {
  state.denyFlush = true; await render(true); await click("Revoke this phone's access"); await click("Confirm revoke"); expect(state.requests).toEqual([]);
  state.denyFlush = false; state.uncertain = true; await click("Confirm revoke"); await click("Confirm revoke"); expect(state.requests).toHaveLength(1); expect(state.remove).not.toHaveBeenCalled();
});
it("refuses confirmation after switching machines", async () => {
  await render(); await click("Revoke device access"); state.id = "other-machine"; await click("Confirm revoke"); expect(state.requests).toEqual([]);
});

it("rechecks the reviewed computer after waiting for draft persistence", async () => {
  let release!: () => void;
  state.flush.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  await render(true); await click("Revoke this phone's access"); await click("Confirm revoke");
  expect(state.requests).toEqual([]); state.id = "new-machine";
  await act(async () => release()); expect(state.requests).toEqual([]); expect(state.remove).not.toHaveBeenCalled();
});
