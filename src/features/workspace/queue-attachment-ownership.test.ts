import { expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
import type { HostTransport } from "@/remote/transport";
import { QueueAttachmentOwnership, queueEditDraftKey } from "./queue-attachment-ownership";
import { encodeQueuedMessageEdit } from "./composer-queue-edit";
import { readonlyRequest } from "@/remote/request-policy";
const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const generation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const nextGeneration = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row = { id: "row", text: "queued", attachments: [{ id, name: "file.txt", mimeType: "text/plain", size: 4, kind: "file" as const, hostEnvironmentId: "env", path: "/attachments/" + id }] };
const snapshot = { revision: 1, messages: [row], status: "paused" as const };
function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: vi.fn(async (key: string) => data.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }) };
  const hostClaims = new Map<string, { id: string; claimId: string }>();
  const remote = { view: snapshot, loseView: false, failRelease: false, corruptClaims: false };
  const remember = (fileId: string, claimId: string) => hostClaims.set(JSON.stringify([fileId, claimId]), { id: fileId, claimId });
  const request = vi.fn(async (method: string, params: Record<string, any>) => {
    if (method.startsWith("sessions.queue.")) {
      if (params.ownerId) for (const row of remote.view.messages) for (const file of row.attachments) remember(file.id, params.claimId);
      if (remote.loseView) { remote.loseView = false; throw new Error("lost queue response"); }
      return remote.view;
    }
    if (method === "attachments.claim") {
      for (const fileId of params.ids) remember(fileId, params.claimId);
      return {};
    }
    if (method === "attachments.claims") {
      if (remote.corruptClaims) return { claims: "bad" };
      const all = [...hostClaims.values()].sort((a, b) => a.id.localeCompare(b.id) || a.claimId.localeCompare(b.claimId));
      const at = params.after ? all.findIndex((entry) => entry.id === params.after.id && entry.claimId === params.after.claimId) + 1 : 0;
      const claims = all.slice(at, at + 200);
      return { claims, ...(at + 200 < all.length ? { next: claims.at(-1) } : {}) };
    }
    if (method === "attachments.release") {
      if (remote.failRelease) throw new Error("lost release response");
      for (const fileId of params.ids) hostClaims.delete(JSON.stringify([fileId, params.claimId]));
      return {};
    }
    throw new Error("unexpected method " + method);
  });
  const client = { machine: { id: "m", environmentId: "env", capabilities: ["attachments.ownership.v1"] }, request } as unknown as HostTransport;
  const nonce = vi.fn().mockReturnValueOnce(generation).mockReturnValue(nextGeneration);
  const owner = new QueueAttachmentOwnership(storage, "m", "env", "s", nonce);
  const edit = () => data.set(queueEditDraftKey("m", "s"), encodeQueuedMessageEdit({ version: 1, original: row, text: "offline edit" })!);
  const releases = () => request.mock.calls.filter((call) => call[0] === "attachments.release");
  return { data, storage, request, client, owner, edit, nonce, remote, hostClaims, remember, releases };
}
it("atomically claims every exported queue view before publishing it and tags changes too", async () => {
  const f = fixture();
  await f.owner.request(f.client, "sessions.queue.get", { sessionId: "s" });
  await f.owner.request(f.client, "sessions.queue.change", { sessionId: "s", before: snapshot, after: snapshot });
  const views = f.request.mock.calls.filter((call) => call[0].startsWith("sessions.queue."));
  expect(views[0]?.[1]).toMatchObject({ ownerId: "mobile-queue:s", claimId: generation });
  expect(views[1]?.[1]).toMatchObject({ ownerId: "mobile-queue:s", claimId: generation });
  expect([...f.data.values()].some((raw) => raw.includes(id))).toBe(true);
});
it("retains an offline editor after another device deletes its row, then releases after durable clear", async () => {
  const f = fixture(); await f.owner.request(f.client, "sessions.queue.get", {});
  await f.owner.retainEdit(f.client, row); f.edit(); await f.owner.persistedEdit(f.client);
  f.remote.view = { ...snapshot, messages: [] };
  await f.owner.request(f.client, "sessions.queue.get", {});
  expect(f.releases()).toHaveLength(0);
  const restarted = new QueueAttachmentOwnership(f.storage, "m", "env", "s", f.nonce);
  await restarted.request(f.client, "sessions.queue.get", {});
  expect(f.releases()).toHaveLength(0);
  f.data.delete(queueEditDraftKey("m", "s")); await restarted.persistedEdit(f.client);
  expect(f.releases().at(-1)?.[1]).toEqual({ ownerId: "mobile-queue:s", claimId: generation, ids: [id] });
});
it("protects the gap between claiming an edit and its successful private draft write", async () => {
  const f = fixture(); await f.owner.request(f.client, "sessions.queue.get", {}); await f.owner.retainEdit(f.client, row);
  f.remote.view = { ...snapshot, messages: [] };
  await f.owner.request(f.client, "sessions.queue.get", {}); expect(f.releases()).toHaveLength(0);
  f.edit(); await f.owner.persistedEdit(f.client); expect(f.releases()).toHaveLength(0);
});
it("rotates a persisted view generation before reacquiring after an ambiguous release", async () => {
  const f = fixture(); await f.owner.request(f.client, "sessions.queue.get", {});
  f.remote.view = { ...snapshot, messages: [] }; f.remote.failRelease = true;
  await f.owner.request(f.client, "sessions.queue.get", {});
  f.remote.view = snapshot; f.remote.failRelease = false;
  await f.owner.request(f.client, "sessions.queue.get", {});
  expect(f.request.mock.calls.filter((call) => call[0] === "sessions.queue.get").at(-1)?.[1]).toMatchObject({ claimId: nextGeneration });
  expect(f.releases().at(-1)?.[1]).toMatchObject({ claimId: generation });
  expect([...f.hostClaims.values()]).toContainEqual({ id, claimId: nextGeneration });
});
it("keeps claims on corrupt editor reads and never exports refs to a different host identity", async () => {
  const f = fixture(); await f.owner.request(f.client, "sessions.queue.get", {});
  f.data.set(queueEditDraftKey("m", "s"), "broken"); f.remote.view = { ...snapshot, messages: [] };
  await f.owner.request(f.client, "sessions.queue.get", {}); expect(f.releases()).toHaveLength(0);
  expect(() => f.owner.request({ ...f.client, machine: { ...f.client.machine, environmentId: "replacement" } } as HostTransport, "sessions.queue.get", {})).toThrow("identity");
});
it("preserves old host queue behavior without ownership calls or storage writes", async () => {
  const f = fixture(); const old = { ...f.client, machine: { ...f.client.machine, capabilities: [] } } as unknown as HostTransport;
  await f.owner.request(old, "sessions.queue.get", { sessionId: "s" });
  expect(f.request).toHaveBeenCalledExactlyOnceWith("sessions.queue.get", { sessionId: "s" }, {}); expect(f.storage.setItem).not.toHaveBeenCalled();
});
it("recovers phantom host claims after a lost queue response and an empty subsequent view", async () => {
  const f = fixture(); f.remote.loseView = true;
  await expect(f.owner.request(f.client, "sessions.queue.get", {})).rejects.toThrow("lost queue");
  expect([...f.hostClaims.values()]).toEqual([{ id, claimId: generation }]);
  f.remote.view = { ...snapshot, messages: [] };
  await f.owner.request(f.client, "sessions.queue.get", {});
  expect(f.hostClaims.size).toBe(0); expect(f.releases().at(-1)?.[1]).toMatchObject({ ids: [id], claimId: generation });
});
it("renews an offline edit before releasing a phantom older generation", async () => {
  const f = fixture(); f.edit(); f.remember(id, ""); f.remote.view = { ...snapshot, messages: [] };
  await f.owner.request(f.client, "sessions.queue.get", {});
  const acquireAt = f.request.mock.calls.findIndex((call) => call[0] === "attachments.claim");
  const listAt = f.request.mock.calls.findIndex((call) => call[0] === "attachments.claims");
  const releaseAt = f.request.mock.calls.findIndex((call) => call[0] === "attachments.release");
  expect(acquireAt).toBeLessThan(listAt); expect(listAt).toBeLessThan(releaseAt);
  expect([...f.hostClaims.values()]).toEqual([{ id, claimId: generation }]);
  expect(f.releases()[0]?.[1]).toMatchObject({ claimId: "" });
});
it("pages host inventory and releases unknown IDs in batches of at most twenty", async () => {
  const f = fixture(); f.remote.view = { ...snapshot, messages: [] };
  for (let at = 0; at < 205; at++) f.remember(at.toString(16).padStart(8, "0") + "-cccc-4ccc-8ccc-cccccccccccc", generation);
  await f.owner.request(f.client, "sessions.queue.get", {});
  expect(f.request.mock.calls.filter((call) => call[0] === "attachments.claims")).toHaveLength(2);
  expect(f.hostClaims.size).toBe(0); expect(f.releases().every((call) => call[1].ids.length <= 20)).toBe(true);
  expect(readonlyRequest("attachments.claims", {})).toBe(true);
});
it("never releases discovered or known claims when inventory is invalid", async () => {
  const f = fixture(); f.edit(); f.remember(id, ""); f.remote.view = { ...snapshot, messages: [] }; f.remote.corruptClaims = true;
  await f.owner.request(f.client, "sessions.queue.get", {}); expect(f.releases()).toHaveLength(0);
  expect(f.hostClaims.size).toBe(2);
});
