// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { usePrReviewDelivery } from "./provider-review-delivery";
import { InboxJobError } from "./provider-jobs";
import { emptyPrReviewDraft, prReviewDraftKey } from "./provider-review-draft";
const state = vi.hoisted(() => ({ records: new Map<string, string>(), saveFails: false, activeId: "machine", projectId: "project", next: 0,
  job: vi.fn(), request: vi.fn(), environmentId: "env" }));
vi.mock("expo-crypto", () => ({ randomUUID: () => `attempt-${++state.next}` }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => state.records.get(key) ?? null,
  setItem: async (key: string, value: string) => { if (state.saveFails) throw new Error("Storage unavailable"); state.records.set(key, value); },
  removeItem: async (key: string) => { state.records.delete(key); },
} }));
vi.mock("@/state/queries", () => ({ useHostClient: () => client }));
vi.mock("@/state/machines", () => ({ useMachines: { getState: () => ({ activeId: state.activeId, selectedProjectId: state.projectId, machines:[client.machine] }) } }));
vi.mock("./provider-jobs", async (original) => ({ ...await original<typeof import("./provider-jobs")>(), runInboxJob: (...args: unknown[]) => state.job(...args) }));
const client = { machine: { id: "machine", get environmentId() { return state.environmentId; }, capabilities: ["inbox.review.v1"] }, request: state.request };
const origin = { machineId: "machine", projectId: "project" };
const item = { provider: "github", kind: "pr", repo: "owner/repo", number: 1, projectPath: "/project" } as const;
const input = { item, projectId: "project" };
const context = { commitId: "a".repeat(40), headOid: "a".repeat(40), additions: 0, deletions: 0, files: [], patch: "", truncated: false };
const review = { commitId: context.commitId, event: "COMMENT" as const, body: "Exact summary", comments: [] };
const key = prReviewDraftKey(origin, item as never);
let hook: ReturnType<typeof usePrReviewDelivery>;
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
function Harness() { hook = usePrReviewDelivery(origin, item as never, input); return null; }
async function mount() { if (!state.records.has(key)) state.records.set(key, JSON.stringify({ ...emptyPrReviewDraft(), ...review })); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container); await act(async () => root.render(createElement(Harness))); }
async function unmount() { await act(async () => root.unmount()); }
afterEach(async () => { await unmount(); state.records.clear(); state.saveFails = false; state.activeId = "machine"; state.projectId = "project"; state.next = 0; state.environmentId = "env"; vi.resetAllMocks(); vi.unstubAllGlobals(); });
it("persists the exact pending request before dispatch and recovers reopening by status only", async () => {
  state.job.mockImplementation(async (_client, command, _signal, requestId) => {
    if (command.action === "review-context") return context;
    const saved = JSON.parse(state.records.get(key)!);
    expect(saved.pending.requestId).toBe(requestId);
    expect(saved.body).toBe(review.body); expect(saved.commitId).toBe(review.commitId);
    throw new InboxJobError("Response lost", true);
  });
  await mount(); await act(async () => hook.submit(review));
  expect(hook.error).toBeInstanceOf(Error);
  expect(hook.value.pending?.requestId).toBe("attempt-1");
  expect(state.job.mock.calls.filter(([, command]) => command.action === "review")).toHaveLength(1);
  await unmount(); state.request.mockClear(); state.request.mockResolvedValue({ id: "host-job", state: "completed", result: {} }); await mount();
  expect(state.request).toHaveBeenCalledExactlyOnceWith("inbox.provider.result", { requestId: "attempt-1" });
  expect(state.job.mock.calls.filter(([, command]) => command.action === "review")).toHaveLength(1);
  expect(hook.value.pending).toBeUndefined(); expect(hook.value.completed).toBe(true);
});
it("retains unknown or missing receipts and refuses a changed host identity", async () => {
  state.records.set(key, JSON.stringify({ ...emptyPrReviewDraft(), ...review, pending: { requestId: "original", environmentId: "env" } }));
  state.request.mockRejectedValue(new Error("Receipt missing or expired"));
  await mount(); expect(hook.value.pending?.requestId).toBe("original");
  await act(async () => hook.submit(review)); expect(state.job).not.toHaveBeenCalled();
  await unmount(); state.environmentId = "replacement-env"; state.request.mockClear(); await mount();
  expect(state.request).not.toHaveBeenCalled(); expect(hook.value.pending?.requestId).toBe("original");
});
it("rejects stale heads and storage failures before the write; a failed terminal receipt preserves editable content", async () => {
  state.job.mockResolvedValue({ ...context, commitId: "b".repeat(40), headOid: "b".repeat(40) });
  await mount(); await act(async () => hook.submit(review));
  expect(state.job).toHaveBeenCalledTimes(1); expect(hook.value.pending).toBeUndefined();
  state.job.mockReset(); state.job.mockResolvedValue(context); state.saveFails = true;
  await act(async () => hook.submit(review));
  expect(state.job.mock.calls.every(([, command]) => command.action === "review-context")).toBe(true);
  expect(hook.value.body).toBe(review.body); expect(hook.value.pending).toBeUndefined();
  state.saveFails = false; await act(async () => hook.draft.persist());
  state.job.mockImplementation(async (_client, command) => { if (command.action === "review-context") return context; throw new InboxJobError("Owner declined", false, true); });
  await act(async () => hook.submit(review));
  expect(hook.value.pending).toBeUndefined(); expect(hook.value.body).toBe(review.body); expect(hook.value.completed).not.toBe(true);
});
it("does not overwrite newer draft edits made while a confirmation is waiting", async () => {
  await mount();
  await act(async () => hook.draft.setValue((latest) => ({ ...latest!, body: "Newer owner edit" })));
  await act(async () => hook.submit(review));
  expect(state.job).not.toHaveBeenCalled(); expect(hook.value.body).toBe("Newer owner edit");
  expect(hook.value.pending).toBeUndefined();
});
