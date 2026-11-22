// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const security = vi.hoisted(() => ({ allowed: true, state: { appState: "active", windowFocused: true }, listeners: new Set<() => void>() }));
vi.mock("@/state/security", () => ({ isAppAccessAllowed: () => security.allowed, useSecurity: { getState: () => security.state, subscribe: (listener: () => void) => { security.listeners.add(listener); return () => security.listeners.delete(listener); } } }));
const clip = vi.hoisted(() => ({ calls: [] as string[], pending: [] as { resolve: (accepted?: boolean) => void; reject: (error: unknown) => void }[] }));
vi.mock("expo-clipboard", () => ({
  setStringAsync: (text: string) => new Promise<boolean>((resolve, reject) => {
    clip.calls.push(text);
    clip.pending.push({ resolve: (accepted = true) => resolve(accepted), reject });
  }),
}));
import { createSingleFlight } from "@/state/single-flight";
import { flushSync } from "react-dom";
import { PrivateContentAccessProvider } from "./private-access";
import { useClipboardFeedback } from "./use-clipboard-feedback";

let api: ReturnType<typeof useClipboardFeedback>;
function Probe({ payload, enabled = true, prepare }: { payload: string; enabled?: boolean; prepare?: () => Promise<string> }) {
  const feedback = useClipboardFeedback(payload, enabled, undefined, prepare); api = feedback;
  return createElement("div", null, createElement("button", { onClick: feedback.copy }, "copy"),
    createElement("p", { id: "state" }, `${feedback.copied ? "copied" : "idle"}|${feedback.busy ? "busy" : "free"}|${feedback.error?.message ?? ""}`));
}
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render(payload: string, enabled = true, prepare?: () => Promise<string>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); }
  await act(async () => root!.render(createElement(Probe, { payload, enabled, prepare })));
}

it("prepares async text once and never copies after access is revoked", async () => {
  let resolve!: (text: string) => void;
  const prepare = vi.fn(() => new Promise<string>(done => { resolve = done; }));
  await render("session", true, prepare);
  await act(async () => { press(); press(); });
  expect(prepare).toHaveBeenCalledOnce();
  expect(clip.calls).toEqual([]);
  security.allowed = false;
  await act(async () => resolve("private text"));
  expect(clip.calls).toEqual([]);
});
it("shows preparation failures and allows an explicit retry", async () => {
  const prepare = vi.fn().mockRejectedValueOnce(new Error("read failed")).mockResolvedValue("User: hello");
  await render("session", true, prepare);
  await act(async () => press());
  expect(state()).toBe("idle|free|read failed");
  expect(clip.calls).toEqual([]);
  await act(async () => press());
  expect(clip.calls).toEqual(["User: hello"]);
  await act(async () => clip.pending[0]!.resolve());
  expect(state()).toBe("copied|free|");
});
const state = () => container.querySelector("#state")!.textContent;
const press = () => container.querySelector("button")!.click();
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); clip.calls = []; clip.pending = []; vi.unstubAllGlobals(); });

it("keeps the copy action retryable when the clipboard declines the write", async () => {
  await render("conversation text");
  await act(async () => press());
  await act(async () => clip.pending[0]!.resolve(false));
  expect(api.copied).toBe(false);
  expect(api.busy).toBe(false);
  expect(api.error).toBeInstanceOf(Error);

  await act(async () => press());
  await act(async () => clip.pending[1]!.resolve(true));
  expect(clip.calls).toEqual(["conversation text", "conversation text"]);
  expect(state()).toBe("copied|free|");
});

it("repeated presses before a render start at most one in-flight copy of the exact payload", async () => {
  const payload = "line one\n\t  trailing  \n🙂";
  await render(payload);
  await act(async () => { press(); press(); press(); });
  expect(clip.calls).toEqual([payload]); expect(state()).toBe("idle|busy|");
  await act(async () => clip.pending[0]!.resolve());
  expect(state()).toBe("copied|free|");
});
it("a delayed failure for an old payload cannot show an obsolete error on the new payload", async () => {
  await render("old");
  await act(async () => press());
  await render("old and streamed more");
  await act(async () => clip.pending[0]!.reject(new Error("clipboard unavailable")));
  expect(state()).toBe("idle|free|");
});
it("a delayed success for an old payload cannot mark the new payload copied", async () => {
  await render("old");
  await act(async () => press());
  await render("new");
  await act(async () => clip.pending[0]!.resolve());
  expect(state()).toBe("idle|free|");
});
it("shows a failure for the current payload and retry clears it and can succeed", async () => {
  await render("payload");
  await act(async () => press());
  await act(async () => clip.pending[0]!.reject(new Error("denied")));
  expect(state()).toBe("idle|free|denied");
  await act(async () => press());
  expect(state()).toBe("idle|busy|"); expect(clip.calls).toEqual(["payload", "payload"]);
  await act(async () => clip.pending[1]!.resolve());
  expect(state()).toBe("copied|free|");
});

beforeEach(() => { security.allowed = true; security.state = { appState: "active", windowFocused: true }; });
it("rejects retained copy callbacks after the payload changes and after unmount", async () => {
 await render("old"); const old = api.copy; await render("new"); await act(async () => old()); expect(clip.calls).toEqual([]);
 const next = api.copy; await act(async () => root!.unmount()); root = undefined; await act(async () => next()); expect(clip.calls).toEqual([]);
});
it("does not start a queued copy when its source retires before the first await", async () => {
 await render("old"); await act(async () => { api.copy(); flushSync(() => root!.render(createElement(Probe, { payload: "new" }))); });
 expect(clip.calls).toEqual([]); await act(async () => api.copy()); expect(clip.calls).toEqual(["new"]);
});
it("does not revive copied feedback or an old callback when an equal payload returns", async () => {
 await render("a"); const old = api.copy; await act(async () => api.copy()); await act(async () => clip.pending[0]!.resolve());
 await render("b"); await render("a"); expect(state()).toBe("idle|free|"); await act(async () => old()); expect(clip.calls).toEqual(["a"]);
});
it("retires a closed reader's callback and acknowledgement across reopening", async () => {
 await render("source"); const old = api.copy; await act(async () => api.copy()); await act(async () => clip.pending[0]!.resolve());
 await render("source", false); await render("source", true); expect(state()).toBe("idle|free|"); await act(async () => old()); expect(clip.calls).toEqual(["source"]);
});
it.each(["lock", "background", "blur"])("does not start a queued copy after transient %s and return", async reason => {
 await render("source"); const old = api.copy;
 await act(async () => { old(); if (reason === "lock") security.allowed = false; if (reason === "background") security.state.appState = "background"; if (reason === "blur") security.state.windowFocused = false;
 security.listeners.forEach(fn => fn()); security.allowed = true; security.state = { appState: "active", windowFocused: true }; security.listeners.forEach(fn => fn()); });
 expect(clip.calls).toEqual([]); await act(async () => old()); expect(clip.calls).toEqual([]);
 await act(async () => api.copy()); expect(clip.calls).toEqual(["source"]);
});
it("keeps an already-started write busy but does not acknowledge it for a reopened reader", async () => {
 await render("source"); await act(async () => api.copy()); await render("source", false); await render("source", true); expect(state()).toBe("idle|busy|");
 await act(async () => api.copy()); expect(clip.calls).toEqual(["source"]); await act(async () => clip.pending[0]!.resolve()); expect(state()).toBe("idle|free|");
 await act(async () => api.copy()); expect(clip.calls).toEqual(["source", "source"]);
});
it("checks current private-content permission before starting a copy", async () => {
 await render("source"); let allowed = false;
 await act(async () => root!.render(createElement(PrivateContentAccessProvider, { value: { allowed: true, check: () => allowed } }, createElement(Probe, { payload: "private" }))));
 await act(async () => api.copy()); expect(clip.calls).toEqual([]); allowed = true; await act(async () => api.copy()); expect(clip.calls).toEqual(["private"]);
});

it("ignores an already-started write's late failure after lock and return", async () => {
 await render("source"); await act(async () => api.copy());
 await act(async () => { security.allowed = false; security.listeners.forEach(fn => fn()); security.allowed = true; security.listeners.forEach(fn => fn()); clip.pending[0]!.reject(new Error("Retired write failed")); });
 expect(state()).toBe("idle|free|"); await act(async () => api.copy()); expect(clip.calls).toEqual(["source", "source"]);
});
it("does not invoke native clipboard while the reader is closed or foreground access is denied", async () => {
 await render("source", false); await act(async () => api.copy()); expect(clip.calls).toEqual([]);
 await render("source"); security.state.windowFocused = false; await act(async () => api.copy()); expect(clip.calls).toEqual([]);
});

it("shares one native-write flight across two explicit copy targets without cross acknowledgement", async () => {
 const flight=createSingleFlight<void>();let left!:ReturnType<typeof useClipboardFeedback>,right!:ReturnType<typeof useClipboardFeedback>;
 function Both(){left=useClipboardFeedback("left",true,flight);right=useClipboardFeedback("right",true,flight);return null;}
 await render("initial");await act(async()=>root!.render(createElement(Both)));await act(async()=>{left.copy();right.copy();});expect(clip.calls).toEqual(["left"]);
 await act(async()=>clip.pending[0]!.resolve());expect(left.copied).toBe(true);expect(right.copied).toBe(false);await act(async()=>right.copy());expect(clip.calls).toEqual(["left","right"]);
});
