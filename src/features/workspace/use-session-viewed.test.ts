// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HostSession } from "./wire";

const state = vi.hoisted(() => ({ active: true, current: true, read: true, request: vi.fn(), invalidate: vi.fn() }));
const client = { request: state.request };
const connection = { isCurrent: () => state.current };
const cache = { invalidateQueries: state.invalidate };
vi.mock("@/state/queries", () => ({
  useHostReadActive: () => state.active, useHostClient: () => client,
  hostKey: (machine: string, key: string[]) => [machine, ...key],
}));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => connection }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => cache }));
import { useSessionViewed } from "./use-session-viewed";

let root: ReturnType<typeof createRoot>;
let node: HTMLDivElement;
let visible: boolean;
let session: HostSession;
const canRead = () => state.read;
function Probe() { useSessionViewed("machine", session, visible, canRead); return null; }
const render = () => act(() => root.render(createElement(Probe)));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  state.active = state.current = state.read = visible = true;
  state.request.mockReset().mockResolvedValue({}); state.invalidate.mockReset().mockResolvedValue(undefined);
  session = { projectId: "p", revision: 4, unread: true, authorityGeneration: 2, session: { id: "s" } } as HostSession;
  node = document.createElement("div"); root = createRoot(node);
});
afterEach(async () => { await act(() => root.unmount()); node.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const tick = (ms = 500) => act(() => vi.advanceTimersByTimeAsync(ms));

it("debounces opening and activity revisions with exact authority and refreshes both lists", async () => {
  await render(); await tick(250); expect(state.request).not.toHaveBeenCalled();
  session = { ...session, revision: 5 }; await render(); await tick(499);
  expect(state.request).not.toHaveBeenCalled(); await tick(1);
  expect(state.request).toHaveBeenCalledExactlyOnceWith("sessions.update", {
    projectId: "p", sessionId: "s", unread: false, expectedRevision: 5, authorityGeneration: 2,
  });
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["machine", "project-summaries"] });
  await render(); await tick(); expect(state.request).toHaveBeenCalledTimes(1);
});

it("cancels on blur/background and refuses stale connection and revoked visibility", async () => {
  await render(); visible = false; await render(); await tick(); expect(state.request).not.toHaveBeenCalled();
  visible = true; state.active = false; await render(); await tick(); expect(state.request).not.toHaveBeenCalled();
  state.active = true; await render(); state.current = false; await tick(); expect(state.request).not.toHaveBeenCalled();
  state.current = true; session = { ...session, revision: 5 }; await render(); state.read = false; await tick();
  expect(state.request).not.toHaveBeenCalled();
});

it("hides auto-read on old Hosts and never replays unknown writes", async () => {
  session = { ...session, unread: undefined }; await render(); await tick(); expect(state.request).not.toHaveBeenCalled();
  state.request.mockRejectedValueOnce({ uncertain: true });
  session = { ...session, unread: true }; await render(); await tick();
  session = { ...session, revision: 5 }; await render(); await tick(); expect(state.request).toHaveBeenCalledTimes(1);
});

it("keeps a manual unread flag from another device until the next opening", async () => {
  session = { ...session, unread: false }; await render(); await tick();
  session = { ...session, revision: 5, unread: true, forceUnread: true };
  await render(); await tick(); expect(state.request).not.toHaveBeenCalled();
  visible = false; await render(); visible = true; await render(); await tick();
  expect(state.request).toHaveBeenCalledTimes(1);
});

it("acknowledges a running turn at most once per window and flushes what was shown on blur", async () => {
  session = { ...session, status: "running" } as HostSession;
  await render(); await tick(); expect(state.request).toHaveBeenCalledTimes(1);
  session = { ...session, revision: 5 }; await render(); await tick(5_000);
  session = { ...session, revision: 6 }; await render(); await tick(5_000);
  expect(state.request).toHaveBeenCalledTimes(1);
  await tick(20_000);
  expect(state.request).toHaveBeenCalledTimes(2);
  expect(state.request).toHaveBeenLastCalledWith("sessions.update", expect.objectContaining({ expectedRevision: 6 }));
  session = { ...session, revision: 7 }; await render(); await tick(1_000);
  expect(state.request).toHaveBeenCalledTimes(2);
  visible = false; await render();
  expect(state.request).toHaveBeenCalledTimes(3);
  expect(state.request).toHaveBeenLastCalledWith("sessions.update", expect.objectContaining({ expectedRevision: 7 }));
});

it("acknowledges right away once the run settles and skips re-reading a streamed session", async () => {
  session = { ...session, status: "running" } as HostSession;
  const Streamed = () => { useSessionViewed("machine", session, visible, canRead, true); return null; };
  await act(() => root.render(createElement(Streamed))); await tick();
  expect(state.request).toHaveBeenCalledTimes(1);
  expect(state.invalidate).not.toHaveBeenCalledWith({ queryKey: ["machine", "session", "s"] });
  session = { ...session, revision: 5, status: "idle" } as HostSession;
  await act(() => root.render(createElement(Streamed))); await tick();
  expect(state.request).toHaveBeenCalledTimes(2);
});
