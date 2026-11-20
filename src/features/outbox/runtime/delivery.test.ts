import { beforeEach, expect, it, vi } from "vitest";
import type { HostTransport } from "@/remote/transport";
import type { HostSession } from "../../workspace/wire";
import { emptyComposerDraft } from "../../workspace/composer-draft";
import { type OutboxRow, OUTBOX_CAPABILITY } from "../model/outbox";

const state = vi.hoisted(() => ({ rows: [] as OutboxRow[], readTail: vi.fn(), upload: vi.fn(), queue: vi.fn(), finished: vi.fn() }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "8ca190f8-9e1b-477d-9565-2fb1283ac580" }));
vi.mock("../../workspace/wire", () => ({ readTail: state.readTail }));
vi.mock("../../workspace/attachment-transfer", () => ({ uploadAttachment: state.upload }));
vi.mock("../../workspace/attachment-ownership", () => ({ attachmentReleases: { stage: vi.fn(async () => {}), flush: vi.fn(async () => {}) } }));
vi.mock("../../workspace/queue-attachment-ownership", () => ({ queueAttachmentOwner: () => ({ request: state.queue }) }));
vi.mock("./store", () => ({ sendOutbox: {
  read: async () => [...state.rows],
  put: async (row: OutboxRow) => { const at = state.rows.findIndex(value => value.id === row.id); if (at < 0) state.rows.push(row); else state.rows[at] = row; },
  update: async (row: OutboxRow) => { const at = state.rows.findIndex(value => value.id === row.id); if (at < 0) throw new Error("removed"); state.rows[at] = row; },
  remove: async (row: OutboxRow) => { state.rows = state.rows.filter(value => value.id !== row.id); },
} }));
vi.mock("./custody", () => ({ finishOutbox: async (row: OutboxRow) => { state.finished(row); state.rows = state.rows.filter(value => value.id !== row.id); } }));

import { flushOutboxSession } from "./delivery";
const firstId = "8ca190f8-9e1b-477d-9565-2fb1283ac578";
const row = (id = firstId): OutboxRow => ({
  id, machineId: "machine", sessionId: "session", projectId: "project", environmentId: "environment", accountId: "account",
  createdAt: Date.now(), mode: "send", draft: { ...emptyComposerDraft(), text: "hello" },
  command: { type: "send", sessionId: "session", clientMessageId: id, text: "hello", attachments: [] },
  model: { harness: "codex", model: "codex:test", modelSettings: {} }, status: "waiting", attempted: false,
});
const session = (): HostSession => ({ session: { id: "session", harness: "codex", model: "codex:test", modelSettings: {}, runtimeMode: "supervised", title: "Test", cwd: "/project", blocks: [] }, projectId: "project", revision: 1, status: "idle", updatedAt: 1 });
function client() {
  return { machine: { id: "machine", environmentId: "environment", capabilities: [OUTBOX_CAPABILITY] }, assertCurrentAccess: vi.fn(),
    request: vi.fn(async (method: string) => method === "commands.status" ? null : { commandId: firstId, sessionId: "session", revision: 2 }),
  } as unknown as HostTransport & { request: ReturnType<typeof vi.fn> };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [row()];
  state.readTail.mockResolvedValue(session());
  state.upload.mockResolvedValue({ id: firstId, name: "image.png", mimeType: "image/png", kind: "image", size: 2 });
  state.queue.mockResolvedValue({ revision: 1, messages: [], leased: true });
});
it("replays original identity once and removes custody after acceptance", async () => {
  const target = client();
  await flushOutboxSession(target, "session", "account", () => true);
  expect(target.request).toHaveBeenCalledWith("commands.dispatch", expect.objectContaining({ commandId: firstId, clientMessageId: firstId, text: "hello" }), { retry: false });
  expect(state.rows).toEqual([]);
});
it("reconciles accepted receipts before missing files or changed model checks", async () => {
  const target = client();
  state.readTail.mockResolvedValue({ ...session(), session: { ...session().session, model: "changed" } });
  target.request.mockResolvedValue({ commandId: firstId, sessionId: "session", revision: 2 });
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.finished).toHaveBeenCalledTimes(1);
  expect(state.upload).not.toHaveBeenCalled();
  expect(target.request).toHaveBeenCalledTimes(1);
});
it("does not send a changed model and does not silently retry its refusal", async () => {
  const target = client();
  state.readTail.mockResolvedValue({ ...session(), session: { ...session().session, model: "changed" } });
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.rows[0]?.status).toBe("blocked");
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.readTail).toHaveBeenCalledTimes(1);
  expect(target.request).toHaveBeenCalledTimes(1);
});
it("drops archived sessions visibly without sending", async () => {
  const target = client();
  state.readTail.mockResolvedValue({ ...session(), archived: true });
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.rows[0]?.status).toBe("dropped");
  expect(target.request).not.toHaveBeenCalled();
});
it("drops deleted sessions visibly", async () => {
  state.readTail.mockRejectedValue(new Error("Session not found on this machine"));
  await flushOutboxSession(client(), "session", "account", () => true);
  expect(state.rows[0]?.status).toBe("dropped");
});
it("stops on sign-out during a preflight await", async () => {
  const target = client();
  let signedIn = true;
  state.readTail.mockImplementation(async () => { signedIn = false; return session(); });
  await flushOutboxSession(target, "session", "account", () => signedIn);
  expect(target.request).not.toHaveBeenCalled();
  expect(state.rows[0]?.status).toBe("dropped");
});
it("pauses rather than drops when the app backgrounds during preflight", async () => {
  const target = client();
  let foreground = true;
  state.readTail.mockImplementation(async () => { foreground = false; return session(); });
  await flushOutboxSession(target, "session", "account", () => foreground, false, () => true);
  expect(target.request).not.toHaveBeenCalled();
  expect(state.rows[0]?.status).toBe("waiting");
});
it("rechecks account access between attachment chunks and never dispatches after sign-out", async () => {
  const target = client();
  let signedIn = true;
  state.rows[0]!.draft.attachments = [{ id: firstId, claimId: firstId, uri: "file:///draft/photo.png", name: "photo.png", size: 2, mimeType: "image/png", kind: "image" }];
  state.upload.mockImplementation(async (...args: unknown[]) => { signedIn = false; (args[7] as () => void)(); });
  await flushOutboxSession(target, "session", "account", () => signedIn);
  expect(target.request.mock.calls.filter(([method]) => method === "commands.dispatch")).toHaveLength(0);
  expect(state.rows[0]?.status).toBe("dropped");
});
it("preserves session order when the first message has a network failure", async () => {
  const target = client();
  state.rows.push(row("8ca190f8-9e1b-477d-9565-2fb1283ac579"));
  target.request.mockImplementation(async (method: string) => { if (method === "commands.status") return null; throw { kind: "network", uncertain: true }; });
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.rows).toHaveLength(2);
  expect(state.rows[0]?.status).toBe("waiting");
  expect(state.readTail).toHaveBeenCalledTimes(1);
});
it("has one flush flight across reconnect and explicit retry", async () => {
  const target = client();
  await Promise.all([flushOutboxSession(target, "session", "account", () => true), flushOutboxSession(target, "session", "account", () => true)]);
  expect(target.request.mock.calls.filter(([method]) => method === "commands.dispatch")).toHaveLength(1);
});
it("does not replay to a Host lacking idempotency", async () => {
  const target = client();
  target.machine.capabilities = [];
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.readTail).not.toHaveBeenCalled();
});
it("drops another account or environment without sending", async () => {
  const target = client();
  state.rows[0]!.environmentId = "other";
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.rows[0]?.status).toBe("dropped");
  expect(target.request).not.toHaveBeenCalled();
});
it("replays attempted queue append with the same identity without needing local files", async () => {
  const target = client();
  state.rows[0]!.mode = "queue";
  state.rows[0]!.attempted = true;
  state.rows[0]!.command = { id: firstId, sessionId: "session", clientMessageId: firstId, text: "hello", attachments: [], modelTarget: state.rows[0]!.model };
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.queue).toHaveBeenCalledWith(target, "sessions.queue.change", expect.objectContaining({ after: expect.objectContaining({ messages: [expect.objectContaining({ id: firstId, clientMessageId: firstId })] }) }), { retry: false });
  expect(state.upload).not.toHaveBeenCalled();
  expect(state.rows).toEqual([]);
});
const stale = () => Date.now() - 25 * 60 * 60 * 1000;
it("holds a message older than 24 hours for review instead of dropping or replaying it", async () => {
  const target = client();
  state.rows[0]!.createdAt = stale();
  state.rows[0]!.draft.attachments = [{ id: firstId, claimId: firstId, uri: "file:///draft/photo.png", name: "photo.png", size: 2, mimeType: "image/png", kind: "image" }];
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.rows[0]).toMatchObject({ status: "blocked", blockedReason: "expired", draft: { text: "hello" } });
  expect(state.rows[0]?.draft.attachments).toHaveLength(1);
  expect(target.request).not.toHaveBeenCalled();
  expect(state.readTail).not.toHaveBeenCalled();
  await flushOutboxSession(target, "session", "account", () => true);
  expect(target.request).not.toHaveBeenCalled();
});
it("never expires a message whose clock moved backwards", async () => {
  state.rows[0]!.createdAt = Date.now() + 48 * 60 * 60 * 1000;
  const target = client();
  await flushOutboxSession(target, "session", "account", () => true);
  expect(target.request).toHaveBeenCalledWith("commands.dispatch", expect.anything(), { retry: false });
});
it("keeps newer messages behind a held old one", async () => {
  const target = client();
  state.rows[0]!.createdAt = stale();
  state.rows.push(row("8ca190f8-9e1b-477d-9565-2fb1283ac579"));
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.rows.map(value => value.status)).toEqual(["blocked", "waiting"]);
  expect(target.request).not.toHaveBeenCalled();
});
it("sends an expired message only after explicit Retry, and only that one", async () => {
  const target = client();
  state.rows[0]!.createdAt = stale();
  state.rows[0]!.status = "blocked";
  state.rows[0]!.blockedReason = "expired";
  state.rows.push({ ...row("8ca190f8-9e1b-477d-9565-2fb1283ac579"), createdAt: stale() });
  target.request.mockImplementation(async (method: string) => method === "commands.status" ? null : { commandId: firstId, sessionId: "session", revision: 2 });
  await flushOutboxSession(target, "session", "account", () => true, true);
  const sent = target.request.mock.calls.filter(([method]) => method === "commands.dispatch");
  expect(sent).toHaveLength(1);
  expect(sent[0]![1]).toMatchObject({ clientMessageId: firstId });
  expect(state.rows.map(value => [value.id, value.status])).toEqual([["8ca190f8-9e1b-477d-9565-2fb1283ac579", "blocked"]]);
});
it("clears the expiry reason when an explicit retry hits an offline failure", async () => {
  const target = client();
  state.rows[0]!.createdAt = stale();
  state.rows[0]!.status = "blocked";
  state.rows[0]!.blockedReason = "expired";
  target.request.mockImplementation(async (method: string) => { if (method === "commands.status") return null; throw { kind: "network", uncertain: true }; });
  await flushOutboxSession(target, "session", "account", () => true, true);
  expect(state.rows[0]?.status).toBe("waiting");
  expect(state.rows[0]?.blockedReason).toBeUndefined();
  expect(state.rows[0]?.draft.text).toBe("hello");
});
it("does not replay an unknown-outcome row after its age expires without owner action", async () => {
  const target = client();
  state.rows[0]!.createdAt = stale();
  state.rows[0]!.attempted = true;
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.rows[0]).toMatchObject({ status: "blocked", blockedReason: "expired", attempted: true });
  expect(target.request).not.toHaveBeenCalled();
});
it("keeps content of another account stored but dropped, never replayed", async () => {
  const target = client();
  state.rows[0]!.createdAt = stale();
  state.rows[0]!.accountId = "other";
  await flushOutboxSession(target, "session", "account", () => true);
  expect(state.rows[0]).toMatchObject({ status: "dropped", draft: { text: "hello" } });
  expect(target.request).not.toHaveBeenCalled();
});
