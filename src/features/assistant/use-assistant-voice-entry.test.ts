// @vitest-environment happy-dom
import { act, createElement as h, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ start: vi.fn(), consume: vi.fn(), open: vi.fn(), current: true }));
vi.mock("./assistant-call-session", () => ({ startAssistantCall: f.start }));
import { useAssistantVoiceEntry } from "./use-assistant-voice-entry";
import { closeAssistantCompanion, useAssistantCompanion } from "./assistant-companion-state";
import { useAssistantCall } from "./assistant-call-state";
import type { AssistantThread } from "../../../../src/shared/model/host-contracts/assistant";
const thread: AssistantThread = { id: "room", projectId: "project", version: 1, summary: "", createdAt: 1, updatedAt: 1 };
let root: ReturnType<typeof createRoot>;
function Entry({ requested = true, ready = true, selected = thread }: { requested?: boolean; ready?: boolean; selected?: AssistantThread | null }) {
  const [target, setTarget] = useState(selected);
  const entry = useAssistantVoiceEntry({ requested, consume: f.consume, ready, machineId: "host", environmentId: "env", thread: target,
    current: () => f.current,
    open: async () => { const opened = await f.open(); if (opened) setTarget(opened); return opened; },
  });
  return h("button", { onClick: entry.start, "data-pending": entry.pending }, "Call");
}
function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  f.start.mockImplementation(async () => { useAssistantCall.setState({ phase: "starting" }); });
  return container;
}
afterEach(async () => {
  await act(async () => root?.unmount()); closeAssistantCompanion();
  useAssistantCall.setState({ phase: "idle", error: undefined }); f.current = true; vi.clearAllMocks(); vi.unstubAllGlobals();
});
it("consumes voice entry once and uses the existing fixed-thread call path under StrictMode", async () => {
  mount(); await act(async () => root.render(h(StrictMode, null, h(Entry))));
  expect(f.consume).toHaveBeenCalledOnce(); expect(f.start).toHaveBeenCalledOnce(); expect(f.open).not.toHaveBeenCalled();
  expect(f.start.mock.calls[0][0]).toEqual({ machineId: "host", environmentId: "env", threadId: "room" });
  expect(useAssistantCompanion.getState()).toMatchObject({ surface: "voice", thread, projectId: "project" });
});
it("waits for access readiness and never starts on a revoked connection", async () => {
  mount(); await act(async () => root.render(h(Entry, { ready: false })));
  expect(f.start).not.toHaveBeenCalled();
  f.current = false; await act(async () => root.render(h(Entry, { ready: true })));
  expect(f.start).not.toHaveBeenCalled();
  f.current = true; await act(async () => root.render(h(Entry, { ready: true })));
  expect(f.start).toHaveBeenCalledOnce();
});
it("opens the selected scope once before starting and does not race StrictMode effects", async () => {
  mount(); f.open.mockResolvedValueOnce(thread);
  await act(async () => root.render(h(StrictMode, null, h(Entry, { selected: null }))));
  expect(f.open).toHaveBeenCalledOnce(); expect(f.start).toHaveBeenCalledOnce();
});
it("does not automatically retry a failed conversation open", async () => {
  const container = mount(); f.open.mockResolvedValueOnce(undefined);
  await act(async () => root.render(h(Entry, { selected: null })));
  expect(f.open).toHaveBeenCalledOnce(); expect(f.start).not.toHaveBeenCalled();
  expect(container.querySelector("button")?.getAttribute("data-pending")).toBe("false");
  await act(async () => root.render(h(Entry, { selected: null })));
  expect(f.open).toHaveBeenCalledOnce();
});
it("route removal prevents a late conversation open from starting capture", async () => {
  mount(); let resolve!: (thread: AssistantThread) => void;
  f.open.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => root.render(h(Entry, { selected: null })));
  await act(async () => root.render(null));
  await act(async () => resolve(thread)); expect(f.start).not.toHaveBeenCalled();
});
it("normal chat entry starts no call and expanding an active call does not restart it", async () => {
  const container = mount(); await act(async () => root.render(h(Entry, { requested: false })));
  expect(f.start).not.toHaveBeenCalled();
  useAssistantCall.setState({ phase: "listening" });
  await act(async () => container.querySelector("button")!.click());
  expect(f.start).not.toHaveBeenCalled(); expect(useAssistantCompanion.getState().surface).toBe("voice");
});
