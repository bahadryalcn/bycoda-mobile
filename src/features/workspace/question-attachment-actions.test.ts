import { expect, it, vi } from "vitest";
import { QuestionAttachmentActions } from "./question-attachment-actions";
import { questionAttachmentStore, questionAttachmentKey } from "./question-attachment-draft";
import type { StagedAttachment } from "./attachment-model";
import type { HostTransport } from "@/remote/transport";
import type { UserQuestionReply } from "./wire";
import { RemoteHostError } from "@/remote/host-error";
const file: StagedAttachment = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "proof.png", mimeType: "image/png", kind: "image", size: 4, uri: "file:///question-drafts/proof" };
function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: vi.fn(async (key: string) => data.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }) };
  const store = questionAttachmentStore(storage, "m", "s");
  const client = { machine: { id: "m", environmentId: "env", capabilities: ["attachments.ownership.v1"] }, assertCurrentAccess: vi.fn() } as unknown as HostTransport;
  let current = true;
  const deps = { pick: vi.fn(async () => [file]), removeFile: vi.fn(), prepare: vi.fn(async () => "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
    upload: vi.fn(async (_file: StagedAttachment, _signal: AbortSignal, _progress: (value: number) => void) => { const { uri, claimId, ...ref } = file; return ref; }),
    stage: vi.fn(async (_files: StagedAttachment[]) => {}), flush: vi.fn(async () => {}) };
  const prompt = { requestId: 1, questions: [{ id: "one", prompt: "One", allowCustom: true, multiSelect: false, options: [] }, { id: "two", prompt: "Two", allowCustom: true, multiSelect: false, options: [] }, { id: "typed", prompt: "Typed", allowCustom: true, preserveCustomWhitespace: true, multiSelect: false, options: [] }] };
  const owner = new QuestionAttachmentActions(store, "occurrence", client, prompt, () => current, deps);
  return { data, storage, store, owner, deps, prompt, change: () => { current = false; } };
}
it("durably separates question files, excludes typed-schema picks and sends metadata without local paths", async () => {
  const f = fixture(); await f.owner.load();
  await f.owner.choose("one", "document");
  f.deps.pick.mockResolvedValueOnce([{ ...file, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }]);
  await f.owner.choose("two", "photo");
  await expect(f.owner.choose("typed", "document")).rejects.toThrow();
  expect(f.deps.pick).toHaveBeenCalledTimes(2);
  const send = vi.fn(async (_reply: UserQuestionReply) => {});
  await f.owner.send({ answers: {}, custom: { typed: "typed" } }, false, send);
  expect(send.mock.calls[0]?.[0]).toMatchObject({ attachments: { one: [{ id: file.id }], two: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }] } });
  expect(JSON.stringify(send.mock.calls)).not.toContain("file:///");
  expect(f.store.read("occurrence")?.delivery).toBe("sending");
  await expect(f.owner.send({ answers: {}, custom: {} }, false, send)).rejects.toThrow();
  expect(send).toHaveBeenCalledOnce();
  expect(f.store.read("occurrence")?.delivery).toBe("sending");
});
it("does not claim or upload until persistence succeeds; failed writes retain attachment-only memory", async () => {
  const f = fixture(); await f.owner.load();
  f.storage.setItem.mockRejectedValueOnce(new Error("disk full"));
  await expect(f.owner.choose("one", "photo")).rejects.toThrow("disk full");
  expect(f.store.files()).toHaveLength(1);
  expect(f.deps.upload).not.toHaveBeenCalled(); expect(f.deps.stage).not.toHaveBeenCalled();
});
it("ignores a late picker and late upload after occurrence changes, retaining uploaded custody without dispatch", async () => {
  const f = fixture(); await f.owner.load();
  let picked!: (files: StagedAttachment[]) => void;
  f.deps.pick.mockImplementationOnce(() => new Promise(resolve => { picked = resolve; }));
  const choosing = f.owner.choose("one", "photo");
  await vi.waitFor(() => expect(picked).toBeDefined()); f.change(); picked([file]);
  await expect(choosing).rejects.toThrow(); expect(f.deps.removeFile).toHaveBeenCalledWith(file);
  const g = fixture(); await g.owner.load(); await g.owner.choose("one", "photo");
  let uploaded!: () => void;
  g.deps.upload.mockImplementationOnce(() => new Promise(resolve => { uploaded = () => resolve(file); }));
  const send = vi.fn(); const sending = g.owner.send({ answers: {}, custom: { two: "two", typed: "typed" } }, false, send);
  await vi.waitFor(() => expect(uploaded).toBeDefined()); g.change(); uploaded();
  await expect(sending).rejects.toThrow(); expect(send).not.toHaveBeenCalled();
  expect(g.store.files()).toHaveLength(1); expect(g.deps.stage).not.toHaveBeenCalled();
});
it.each([false, true])("retains files on failed vs uncertain dispatch and blocks unknown resend (%s)", async uncertain => {
  const f = fixture(); await f.owner.load(); await f.owner.choose("one", "document");
  const send = vi.fn().mockRejectedValue(new RemoteHostError("m", "network", "send failed", uncertain));
  await expect(f.owner.send({ answers: {}, custom: { two: "two", typed: "typed" } }, false, send)).rejects.toThrow("send failed");
  expect(f.store.read("occurrence")?.delivery).toBe(uncertain ? "unknown" : "failed");
  expect(f.store.files()).toHaveLength(1); expect(f.deps.stage).not.toHaveBeenCalled();
  const remounted = questionAttachmentStore(f.storage, "m", "s");
  expect(remounted.read("occurrence")?.delivery).toBe(uncertain ? "unknown" : "failed");
  if (uncertain) { await expect(f.owner.send({ answers: {}, custom: {} }, false, send)).rejects.toThrow(); expect(send).toHaveBeenCalledOnce(); }
});
it("removes only after durable ownership, retains failed removal, then releases genuinely orphaned refs", async () => {
  const f = fixture(); await f.owner.load(); await f.owner.choose("one", "document");
  await f.owner.retry("one", file);
  f.storage.setItem.mockRejectedValueOnce(new Error("disk full"));
  await expect(f.owner.remove("one", file)).rejects.toThrow("disk full");
  expect(f.deps.removeFile).not.toHaveBeenCalled(); expect(f.store.files()).toHaveLength(1);
  await f.owner.remove("one", file);
  expect(f.deps.stage).toHaveBeenCalled(); expect(f.store.files()).toHaveLength(0);
  expect(f.deps.removeFile).toHaveBeenCalledWith(expect.objectContaining({ id: file.id }));
  expect(JSON.parse(f.data.get(questionAttachmentKey("m", "s"))!).entries.occurrence.draft.attachments.one).toEqual([]);
});
it("persists visible upload failure through a fresh owner and clears it after successful retry", async () => {
  const f = fixture(); await f.owner.load(); await f.owner.choose("one", "photo");
  f.deps.upload.mockRejectedValueOnce(new Error("upload refused"));
  await expect(f.owner.retry("one", file)).rejects.toThrow("upload refused");
  expect(f.store.read("occurrence")?.failures?.[file.id]).toBe("upload refused");
  await f.owner.retry("one", file);
  expect(f.store.read("occurrence")?.failures?.[file.id]).toBeUndefined();
  expect(f.owner.transferStates()[file.id].status).toBe("ready");
});
it("enforces the aggregate 20-file limit across questions before admitting or claiming a new batch", async () => {
  const f = fixture(); await f.owner.load();
  const files = Array.from({ length: 20 }, (_, i) => ({ ...file, id: `${i.toString(16).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa` }));
  f.deps.pick.mockResolvedValueOnce(files);
  await f.owner.choose("one", "document");
  await expect(f.owner.choose("two", "photo")).rejects.toThrow("20 files");
  expect(f.store.files()).toHaveLength(20); expect(f.deps.removeFile).toHaveBeenCalledExactlyOnceWith(file);
  expect(f.deps.upload).not.toHaveBeenCalled(); expect(f.deps.stage).not.toHaveBeenCalled();
});
