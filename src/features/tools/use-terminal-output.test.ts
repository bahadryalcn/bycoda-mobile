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
