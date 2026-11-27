// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { create } from "zustand";
import type { HostTransport } from "@/remote/transport";
vi.mock("@/state/security", () => ({
  useSecurity: create(() => ({ status: "unlocked", appState: "active", windowFocused: true })),
}));
import { useSecurity } from "@/state/security";
import { useTerminalOutput } from "./use-terminal-output";
let root: Root;
let element: HTMLDivElement;
let focused = true;
let refetch: () => Promise<void>;
const request = vi.fn();
const client = { request } as unknown as HostTransport;
function Probe() {
  refetch = useTerminalOutput(client, "p", "t", true, focused).refetch;
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  focused = true;
  useSecurity.setState({ status: "unlocked", appState: "active", windowFocused: true });
  request.mockReset().mockImplementation(() => new Promise(() => {}));
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
});
afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
  vi.useRealTimers();
});
for (const state of [
  { appState: "inactive" }, { appState: "background" }, { status: "locked" }, { windowFocused: false },
] as const) {
  it(`aborts pending reads and suspends all polling for ${JSON.stringify(state)}`, async () => {
    await act(async () => root.render(createElement(Probe)));
    expect(request).toHaveBeenCalledOnce();
    const signal = request.mock.calls[0]![2].signal as AbortSignal;
    await act(async () => { useSecurity.setState(state); });
    expect(signal.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); await refetch(); });
    expect(request).toHaveBeenCalledOnce();
    await act(async () => { useSecurity.setState({ status: "unlocked", appState: "active", windowFocused: true }); });
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1499); });
    expect(request).toHaveBeenCalledTimes(2);
  });
}
it("route blur cancels pending work; focus performs one fresh read", async () => {
  await act(async () => root.render(createElement(Probe)));
  const signal = request.mock.calls[0]![2].signal as AbortSignal;
  focused = false;
  await act(async () => root.render(createElement(Probe)));
  expect(signal.aborted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(4500); await refetch(); });
  expect(request).toHaveBeenCalledOnce();
  focused = true;
  await act(async () => root.render(createElement(Probe)));
  expect(request).toHaveBeenCalledTimes(2);
});

const snapshot = { terminal: { id: "t", projectId: "p" }, output: "", cursor: 0, truncated: false, hasMore: false };
let renders = 0;
let lastFetching = false;
function Recorder() {
  const result = useTerminalOutput(client, "p", "t", true, true);
  renders += 1;
  lastFetching = result.isFetching;
  refetch = result.refetch;
  return null;
}
it("background polls with unchanged output neither flash fetching nor re-render", async () => {
  request.mockImplementation(async () => snapshot);
  await act(async () => root.render(createElement(Recorder)));
  const afterFirstRead = renders;
  expect(lastFetching).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
  expect(request.mock.calls.length).toBeGreaterThan(2);
  expect(renders).toBe(afterFirstRead);
  expect(lastFetching).toBe(false);
});
it("backs off after read failures while an explicit retry still reads immediately", async () => {
  request.mockImplementation(async () => { throw new Error("Host unreachable"); });
  await act(async () => root.render(createElement(Recorder)));
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(5999); });
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => { await refetch(); });
  expect(request).toHaveBeenCalledTimes(3);
});
it("auth failures stop background polling, while an explicit retry still reads", async () => {
  request.mockImplementation(async () => { throw Object.assign(new Error("denied"), { kind: "auth" }); });
  await act(async () => root.render(createElement(Recorder)));
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { await refetch(); });
  expect(request).toHaveBeenCalledTimes(2);
});
it("a screenshot, shade or share sheet keeps the shown buffer and resumes from its cursor", async () => {
  const shown = { terminal: { id: "t", projectId: "p" }, output: "hello", cursor: 5, truncated: false, hasMore: false };
  request.mockImplementation(async () => shown);
  let latest: ReturnType<typeof useTerminalOutput> | undefined;
  function Viewer() { latest = useTerminalOutput(client, "p", "t", true, true); return null; }
  await act(async () => root.render(createElement(Viewer)));
  expect(latest?.data?.output).toBe("hello");
  await act(async () => { useSecurity.setState({ windowFocused: false }); });
  expect(latest?.data?.output).toBe("hello");
  request.mockClear();
  await act(async () => { useSecurity.setState({ windowFocused: true }); });
  expect(latest?.data?.output).toBe("hello");
  expect(latest?.isPending).toBe(false);
  expect(latest?.isFetching).toBe(false);
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0]![1]).toMatchObject({ after: 5 });
});
it("reads a quiet terminal less often and stops polling an exited shell", async () => {
  request.mockImplementation(async () => snapshot);
  await act(async () => root.render(createElement(Recorder)));
  // First read plus three unchanged polls at the base rate, then the poll slows to 3 s.
  await act(async () => { await vi.advanceTimersByTimeAsync(1500 * 4); });
  expect(request).toHaveBeenCalledTimes(5);
  await act(async () => { await vi.advanceTimersByTimeAsync(2999); });
  expect(request).toHaveBeenCalledTimes(5);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(request).toHaveBeenCalledTimes(6);
  request.mockImplementation(async () => ({ ...snapshot, terminal: { ...snapshot.terminal, state: "exited" } }));
  await act(async () => { await refetch(); });
  const calls = request.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(request).toHaveBeenCalledTimes(calls);
  await act(async () => { await refetch(); });
  expect(request).toHaveBeenCalledTimes(calls + 1);
});

it("poke reads the echo at once, and once more right after a read already in flight", async () => {
  let poke!: () => void;
  function Poker() {
    poke = useTerminalOutput(client, "p", "t", true, true).poke;
    return null;
  }
  let finish!: () => void;
  request.mockImplementation(() => new Promise((resolve) => { finish = () => resolve(snapshot); }));
  await act(async () => root.render(createElement(Poker)));
  expect(request).toHaveBeenCalledOnce();
  // A keystroke while the first read is in flight: the next read follows it without the poll delay.
  await act(async () => poke());
  expect(request).toHaveBeenCalledOnce();
  await act(async () => { finish(); await vi.advanceTimersByTimeAsync(0); });
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => { finish(); await vi.advanceTimersByTimeAsync(0); });
  // Idle: a poke reads immediately instead of waiting 1.5 s.
  await act(async () => { poke(); await vi.advanceTimersByTimeAsync(0); });
  expect(request).toHaveBeenCalledTimes(3);
});
