// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorktreeRemoval } from "./worktree-removal";
const f = vi.hoisted(() => ({ raw: null as string | null, activeId: "machine", endpoint: "https://fixture", request: vi.fn(), confirmation: undefined as undefined | (() => void), failSave: false }));
const review = { reviewId: "review", expiresAt: Date.now() + 120000, projectCwd: "/repo", path: "/trees/task", branch: "task", head: "abc", dirty: false, unpushed: 0, sessionIds: ["idle"], activeSessionIds: [], hasTerminals: false, hasAgents: false, hasOpenFiles: false, canRemove: true, reasons: [], effects: { detachSessionIds: ["idle"], rebindProjectCwd: "/repo" }, atomic: false };
vi.mock("expo-crypto", () => ({ randomUUID: () => "request", digestStringAsync: async () => "a".repeat(64), CryptoDigestAlgorithm: { SHA256: "SHA256" } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: async () => f.raw, setItem: async (_key: string, value: string) => { if (f.failSave) throw new Error("Storage failed"); f.raw = value; }, removeItem: async () => { f.raw = null; } } }));
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: "machine", environmentId: "env", endpoint: f.endpoint, lanKey: "fixture-key", capabilities: ["worktrees.removal.desktop.v1"] });
  return { useActiveMachine: machine, useMachines: { getState: () => ({ activeId: f.activeId, machines: [machine()] }) } };
});
vi.mock("@/state/queries", () => ({ useHostClient: () => ({ request: f.request }), useHostQuery: () => ({ isSuccess: true, data: { worktrees: [{ path: "/trees/task", branch: "task", isMain: false, missing: false }] }, refetch: async () => {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_a: string, _b: string, _c: string, done: () => void) => { f.confirmation = done; } }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Sheet: wrapper, Body: wrapper, Notice: ({ message }: { message: string }) => createElement("div", null, message), ErrorText: () => null, QueryState: () => null,
    Button: ({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
    SelectField: ({ onChange }: { onChange: (value: string) => void }) => createElement("button", { onClick: () => onChange("/trees/task") }, "Choose task") };
});
let root: ReturnType<typeof createRoot>; const element = document.createElement("div");
async function mount() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(element); await act(async () => root.render(createElement(WorktreeRemoval, { scope: { machineId: "machine", sessionId: "base" }, projectId: "project", onClose: vi.fn() }))); }
async function click(label: string) { await act(async () => [...element.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
async function openReview() { await mount(); await click("Choose task"); await click("Review removal"); }
afterEach(async () => { await act(async () => root?.unmount()); f.raw = null; f.activeId = "machine"; f.endpoint = "https://fixture"; f.failSave = false; f.confirmation = undefined; vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("persists intent before native approval and restores status-only without replay", async () => {
  f.request.mockImplementation(async (method: string) => { if (method.endsWith("review")) return review; if (method.endsWith("approve")) { expect(f.raw).toContain("request"); throw new Error("Lost response"); } return { state: "unknown" }; });
  await openReview(); await click("Request computer approval");
  expect(f.request.mock.calls.filter(([method]) => method.endsWith("approve"))).toHaveLength(1);
  await act(async () => root.unmount()); await mount(); await click("Read result");
  expect(f.request.mock.calls.filter(([method]) => method.endsWith("approve"))).toHaveLength(1);
  expect(f.request).toHaveBeenLastCalledWith("worktrees.removal.status", { projectId: "project", sessionId: "base", requestId: "request" });
});
it("refuses approval when durable storage fails", async () => {
  f.request.mockResolvedValue(review); await openReview(); f.failSave = true; await click("Request computer approval");
  expect(f.request.mock.calls.map(([method]) => method)).toEqual(["worktrees.removal.review"]);
});
it("refuses delayed approval after same-ID endpoint re-pair", async () => {
  f.request.mockResolvedValue(review); await openReview(); f.endpoint = "https://different"; await click("Request computer approval");
  expect(f.request.mock.calls.map(([method]) => method)).toEqual(["worktrees.removal.review"]);
});
it("unknown receipt requires a separate explicit local-only clear confirmation", async () => {
  f.raw = JSON.stringify({ operationId: "saved", environmentId: "env", digest: "a".repeat(64) }); f.request.mockResolvedValue({ state: "unknown" });
  await mount(); await click("Read result"); await click("Clear local tracking"); expect(f.raw).not.toBeNull();
  await act(async () => f.confirmation!()); expect(f.raw).toBeNull();
  expect(f.request.mock.calls.map(([method]) => method)).toEqual(["worktrees.removal.status"]);
});
