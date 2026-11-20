import { expect, it, vi } from "vitest";
import { QuestionAttachmentDraftStore, flushQuestionAttachmentDrafts, questionAttachmentKey, questionAttachmentStore, type QuestionAttachmentDraft } from "./question-attachment-draft";
import { reconcileQuestionAttachments } from "./question-attachment-cleanup";
const file = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", claimId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "proof", kind: "file" as const, mimeType: "text/plain", size: 1, uri: "file:///question-drafts/proof" };
const entry = (delivery?: QuestionAttachmentDraft["delivery"]): QuestionAttachmentDraft => ({ environmentId: "env", draft: { answers: {}, custom: {}, attachments: { one: [file] } }, delivery });
function fixture() {
  const data = new Map<string, string>();
  const storage = { getItem: vi.fn(async (key: string) => data.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }) };
  const key = questionAttachmentKey("m", "s");
  const store = new QuestionAttachmentDraftStore(storage, key);
  const cleanup = { stage: vi.fn(async () => {}), removeFile: vi.fn(async () => {}), flush: vi.fn(async () => {}) };
  return { data, storage, key, store, cleanup };
}
it("serializes concurrent occurrence writes and restores attachment-only plus unknown custody after process restart", async () => {
  const f = fixture(); await f.store.hydrate();
  await Promise.all([f.store.save("one", entry()), f.store.save("two", entry("unknown"))]);
  const restarted = new QuestionAttachmentDraftStore(f.storage, f.key); await restarted.hydrate();
  expect(restarted.read("one")?.draft.attachments?.one).toEqual([file]);
  expect(restarted.read("two")?.delivery).toBe("unknown");
  expect(restarted.files()).toHaveLength(2);
});
it("cleans only authoritative orphan drafts, retaining unknown/queued/sending custody and active question files", async () => {
  const f = fixture(); await f.store.hydrate();
  for (const [id, delivery] of [["active", undefined], ["orphan", "failed"], ["unknown", "unknown"], ["queued", "queued"], ["sending", "sending"]] as const)
    await f.store.save(id, entry(delivery));
  await reconcileQuestionAttachments(f.store, 5, new Set(["active"]), "env", () => true, f.cleanup);
  expect(f.store.all().map(([id]) => id).sort()).toEqual(["active", "queued", "sending", "unknown"]);
  expect(f.cleanup.stage).toHaveBeenCalledExactlyOnceWith([file]);
  expect(f.cleanup.removeFile).toHaveBeenCalledExactlyOnceWith(file);
  // Older snapshots cannot clean a newer snapshot's active occurrence.
  await reconcileQuestionAttachments(f.store, 4, new Set(), "env", () => true, f.cleanup);
  expect(f.store.read("active")).toBeDefined(); expect(f.cleanup.stage).toHaveBeenCalledOnce();
});
it("failed orphan persistence never stages release and malformed storage never authorizes cleanup", async () => {
  const f = fixture(); await f.store.hydrate(); await f.store.save("orphan", entry());
  f.storage.setItem.mockRejectedValueOnce(new Error("disk full"));
  await expect(reconcileQuestionAttachments(f.store, 1, new Set(), "env", () => true, f.cleanup)).rejects.toThrow("disk full");
  expect(f.cleanup.stage).not.toHaveBeenCalled(); expect(f.store.files()).toHaveLength(1);
  f.data.set(f.key, '{"version":1,"entries":null}');
  await expect(new QuestionAttachmentDraftStore(f.storage, f.key).hydrate()).rejects.toThrow();
  expect(f.cleanup.removeFile).not.toHaveBeenCalled();
});
it("snapshot replacement during staging retains reappearing files", async () => {
  const f = fixture(); await f.store.hydrate(); await f.store.save("orphan", entry());
  f.cleanup.stage.mockImplementationOnce(async () => { f.store.observe(2, new Set(["orphan"])); });
  await reconcileQuestionAttachments(f.store, 1, new Set(), "env", () => true, f.cleanup);
  expect(f.store.read("orphan")).toBeDefined(); expect(f.cleanup.removeFile).not.toHaveBeenCalled();
});
it("keeps a concurrent mounted editor's text when durable file removal finishes", async () => {
  const f = fixture(); await f.store.hydrate(); await f.store.save("one", entry());
  let finish!: () => void;
  f.storage.setItem.mockImplementationOnce((key, value) => new Promise(resolve => {
    finish = () => { f.data.set(key, value); resolve(); };
  }));
  const removing = f.store.replace("one", current => ({ ...current, draft: { ...current.draft, attachments: { one: [] } } }));
  await vi.waitFor(() => expect(finish).toBeDefined());
  const typing = f.store.save("one", { ...entry(), draft: { ...entry().draft, custom: { one: "Concurrent text" } } });
  finish(); await removing; await typing;
  const restarted = new QuestionAttachmentDraftStore(f.storage, f.key); await restarted.hydrate();
  expect(restarted.read("one")?.draft.custom.one).toBe("Concurrent text");
  expect(restarted.files()).toEqual([]);
});
const typed = (text: string, delivery?: QuestionAttachmentDraft["delivery"]): QuestionAttachmentDraft =>
  ({ ...entry(delivery), draft: { ...entry().draft, custom: { one: text } } });
const stored = (f: ReturnType<typeof fixture>) => JSON.parse(f.data.get(f.key) ?? "null")?.entries;
it("coalesces typing into one trailing write while memory stays exact on every keystroke", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture(); await f.store.hydrate();
    const writes = f.storage.setItem.mock.calls.length;
    const saves = ["a", "ab", "abc"].map(text => f.store.saveLater("one", typed(text)));
    expect(f.store.read("one")?.draft.custom.one).toBe("abc");
    await vi.advanceTimersByTimeAsync(399);
    expect(f.storage.setItem.mock.calls.length).toBe(writes);
    await vi.advanceTimersByTimeAsync(1); await Promise.all(saves);
    expect(f.storage.setItem.mock.calls.length).toBe(writes + 1);
    expect(f.storage.getItem.mock.calls.length).toBe(2); // hydrate + the single coalesced read
    expect(stored(f).one.draft.custom.one).toBe("abc"); expect(stored(f).one.draft.attachments.one).toEqual([file]);
    // Typing restarts the trailing window instead of writing mid-burst.
    void f.store.saveLater("one", typed("x")); await vi.advanceTimersByTimeAsync(300);
    void f.store.saveLater("one", typed("xy")); await vi.advanceTimersByTimeAsync(300);
    expect(f.storage.setItem.mock.calls.length).toBe(writes + 1);
    await vi.advanceTimersByTimeAsync(100);
    expect(stored(f).one.draft.custom.one).toBe("xy");
  } finally { vi.useRealTimers(); }
});
it("flushes pending text immediately for blur, unmount, background and an attachment save, without a timer", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture(); await f.store.hydrate();
    const pending = f.store.saveLater("one", typed("held"));
    await f.store.flush(); await pending;
    expect(stored(f).one.draft.custom.one).toBe("held");
    const writes = f.storage.setItem.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000); expect(f.storage.setItem.mock.calls.length).toBe(writes); // timer was cancelled
    await f.store.flush(); expect(f.storage.setItem.mock.calls.length).toBe(writes); // nothing dirty: no write
    // A custody write (attachment change) carries the newest pending text too.
    void f.store.saveLater("one", typed("held more"));
    await f.store.save("one", { ...typed("held more"), delivery: "queued" });
    expect(stored(f).one).toMatchObject({ delivery: "queued", draft: { custom: { one: "held more" } } });
    await vi.advanceTimersByTimeAsync(1000); expect(f.storage.setItem.mock.calls.length).toBe(writes + 1);
  } finally { vi.useRealTimers(); }
});
it("keeps failed debounced text in memory, rejects every coalesced caller and retries it on the next flush", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture(); await f.store.hydrate();
    f.storage.setItem.mockRejectedValueOnce(new Error("disk full"));
    const first = f.store.saveLater("one", typed("a")); const second = f.store.saveLater("one", typed("ab"));
    const failures = Promise.allSettled([first, second]);
    await vi.advanceTimersByTimeAsync(400);
    expect((await failures).map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect(f.store.read("one")?.draft.custom.one).toBe("ab"); expect(f.data.has(f.key)).toBe(false);
    await f.store.flush();
    expect(stored(f).one.draft.custom.one).toBe("ab");
  } finally { vi.useRealTimers(); }
});
it("flushes every session store of a storage when the app leaves the foreground", async () => {
  vi.useFakeTimers();
  try {
    const data = new Map<string, string>();
    const storage = { getItem: vi.fn(async (key: string) => data.get(key) ?? null), setItem: vi.fn(async (key: string, value: string) => { data.set(key, value); }) };
    const one = questionAttachmentStore(storage, "m", "s1"); const two = questionAttachmentStore(storage, "m", "s2");
    await Promise.all([one.hydrate(), two.hydrate()]);
    void one.saveLater("a", typed("first")); void two.saveLater("b", typed("second"));
    await flushQuestionAttachmentDrafts(storage);
    expect(JSON.parse(data.get(questionAttachmentKey("m", "s1"))!).entries.a.draft.custom.one).toBe("first");
    expect(JSON.parse(data.get(questionAttachmentKey("m", "s2"))!).entries.b.draft.custom.one).toBe("second");
  } finally { vi.useRealTimers(); }
});
