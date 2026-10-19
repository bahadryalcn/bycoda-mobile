import { expect, it, vi } from "vitest";
vi.mock("expo-crypto", () => ({ randomUUID: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));
import type { HostTransport } from "@/remote/transport";
import { AttachmentReleaseOutbox, ATTACHMENT_OWNERSHIP_CAPABILITY, composerDraftKey } from "./attachment-ownership";
import { emptyComposerDraft, encodeComposerDraft } from "./composer-draft";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const claimId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const file = { id, claimId };
function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: vi.fn(async (key: string) => data.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }) };
  const request = vi.fn().mockResolvedValue({ released: true });
  const client = { machine: { id: "m", environmentId: "env", capabilities: [ATTACHMENT_OWNERSHIP_CAPABILITY] }, request } as unknown as HostTransport;
  const save = (session: string, attached: boolean) => {
    const key = composerDraftKey("m", session);
    if (attached) data.set(key, encodeComposerDraft({ ...emptyComposerDraft(), attachments: [{ id, claimId, name: "file", size: 1, mimeType: "text/plain", kind: "file", uri: "file:///draft" }] })!);
    else data.delete(key);
  };
  return { data, storage, request, client, save, outbox: new AttachmentReleaseOutbox(storage) };
}
it("keeps a tombstoned attachment claimed while its durable draft still references it", async () => {
  const f = fixture(); f.save("s", true);
  await f.outbox.stage(f.client, "s", [file]);
  // Simulate a crash after staging, before the local draft removal persisted.
  await new AttachmentReleaseOutbox(f.storage).flush(f.client);
  expect(f.request).not.toHaveBeenCalled();
  f.save("s", false);
  await new AttachmentReleaseOutbox(f.storage).flush(f.client);
  expect(f.request).toHaveBeenCalledExactlyOnceWith("attachments.release", { ownerId: "mobile:s", claimId, ids: [id] }, { retry: false });
});
it("retries an offline release after restart without losing its persisted intent", async () => {
  const f = fixture(); f.save("s", true);
  await f.outbox.stage({ machine: f.client.machine }, "s", [file]);
  f.save("s", false);
  f.request.mockRejectedValueOnce(new Error("offline"));
  await expect(f.outbox.flush(f.client)).rejects.toThrow("offline");
  await new AttachmentReleaseOutbox(f.storage).flush(f.client);
  expect(f.request).toHaveBeenCalledTimes(2);
  await new AttachmentReleaseOutbox(f.storage).flush(f.client);
  expect(f.request).toHaveBeenCalledTimes(2);
});
it("releases one owner without releasing another owner's saved copy of the same file", async () => {
  const f = fixture(); f.save("other", true);
  await f.outbox.stage(f.client, "s", [file]);
  await f.outbox.stage(f.client, "other", [file]);
  await f.outbox.flush(f.client);
  expect(f.request).toHaveBeenCalledExactlyOnceWith("attachments.release", { ownerId: "mobile:s", claimId, ids: [id] }, { retry: false });
  f.save("other", false);
  await f.outbox.flush(f.client);
  expect(f.request.mock.calls[1]?.[1]).toEqual({ ownerId: "mobile:other", claimId, ids: [id] });
});
it("never replays an intent to a different machine identity", async () => {
  const f = fixture();
  await f.outbox.stage(f.client, "s", [file]);
  await f.outbox.flush({ ...f.client, machine: { ...f.client.machine, environmentId: "replacement" } } as HostTransport);
  await f.outbox.flush({ ...f.client, machine: { ...f.client.machine, id: "other" } } as HostTransport);
  expect(f.request).not.toHaveBeenCalled();
});
it("fails closed on unread/corrupt drafts and recovers without deleting the intent", async () => {
  const f = fixture(); await f.outbox.stage(f.client, "s", [file]);
  f.data.set(composerDraftKey("m", "s"), 'bycoda-composer-v2:\n{"attachments":null}');
  await expect(f.outbox.flush(f.client)).rejects.toThrow();
  expect(f.request).not.toHaveBeenCalled();
  f.save("s", false);
  await f.outbox.flush(f.client);
  expect(f.request).toHaveBeenCalledOnce();
});
it("does not remove the draft if writing the required intent fails", async () => {
  const f = fixture(); f.save("s", true);
  f.storage.setItem.mockRejectedValueOnce(new Error("disk full"));
  await expect(f.outbox.stage(f.client, "s", [file])).rejects.toThrow("disk full");
  expect(f.data.has(composerDraftKey("m", "s"))).toBe(true);
  expect(f.request).not.toHaveBeenCalled();
});
it("does not call ownership endpoints for an older host", async () => {
  const f = fixture(); const legacy = { ...f.client, machine: { ...f.client.machine, capabilities: [] } } as unknown as HostTransport;
  await f.outbox.stage(legacy, "s", [file]); await f.outbox.flush(legacy);
  expect(f.storage.setItem).not.toHaveBeenCalled(); expect(f.request).not.toHaveBeenCalled();
});
it("serializes release and reacquisition so an older release cannot erase a newer claim", async () => {
  const f = fixture(); await f.outbox.stage(f.client, "s", [file]);
  let finish!: () => void;
  f.request.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const flushing = f.outbox.flush(f.client);
  await vi.waitFor(() => expect(f.request).toHaveBeenCalledOnce());
  f.save("s", true);
  const claiming = f.outbox.claim(f.client, "s", [id], claimId, {});
  await Promise.resolve(); expect(f.request).toHaveBeenCalledOnce();
  finish(); await flushing; await claiming;
  expect(f.request.mock.calls[1]?.[0]).toBe("attachments.claim");
});

it("rotates a pending generation and releases only the old nonce after draft re-add", async () => {
  const f = fixture(); f.save("s", true);
  await f.outbox.stage(f.client, "s", [file]);
  const next = await f.outbox.prepare(f.client, "s", file);
  expect(next).not.toBe(claimId);
  const key = composerDraftKey("m", "s");
  f.data.set(key, f.data.get(key)!.replaceAll(claimId, next));
  await f.outbox.claim(f.client, "s", [id], next, {});
  await f.outbox.flush(f.client);
  expect(f.request.mock.calls[0]?.[1]).toMatchObject({ claimId: next });
  expect(f.request.mock.calls[1]?.[1]).toMatchObject({ claimId });
  expect(await f.outbox.prepare(f.client, "s", { id, claimId: next })).toBe(next);
});
it("never releases a pre-migration file whose claim generation is unknown", async () => {
  const f = fixture(); await f.outbox.stage(f.client, "s", [{ id }]); await f.outbox.flush(f.client);
  expect(f.request).not.toHaveBeenCalled();
});

it.each(["legacy draft prose", "bycoda-composer-v2:", "bycoda-composer-v3:\n{}", "bycoda-composer-v2:\n{broken"]) (
  "does not infer managed attachment removal from malformed or legacy storage: %s", async (raw) => {
    const f = fixture(); await f.outbox.stage(f.client, "s", [file]);
    f.data.set(composerDraftKey("m", "s"), raw);
    await expect(f.outbox.flush(f.client)).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
  },
);
