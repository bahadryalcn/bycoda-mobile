import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNoteDraftWriter, NOTE_DRAFT_SAVE_DELAY_MS, type NoteDraftWriteState } from "./note-draft-writer";
import { createNoteDraftStore, noteDraftKey, type LocalNoteDraft } from "./note-drafts";

const base: LocalNoteDraft = { id: "note-1", title: "Title", body: "", tags: "", expectedUpdatedAt: 4 };
const edit = (body: string): LocalNoteDraft => ({ ...base, body });

function disk(options: { failWrites?: number; gate?: Promise<void> } = {}) {
  const values = new Map<string, string>();
  let failures = options.failWrites ?? 0;
  const writes: string[] = [];
  return {
    values, writes,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      writes.push(value);
      if (failures > 0) { failures--; throw new Error("disk full"); }
      if (options.gate) await options.gate;
      values.set(key, value);
    },
    removeItem: async (key: string) => { values.delete(key); },
  };
}
const stored = (storage: ReturnType<typeof disk>, machine = "computer-a") =>
  ((JSON.parse(storage.values.get(noteDraftKey(machine)) ?? "null") as { drafts: LocalNoteDraft[] } | null)
    ?.drafts.at(-1) ?? null);
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("note draft writer", () => {
  it("collapses a typing burst into one write of the newest draft after the quiet period", async () => {
    const storage = disk(), states: NoteDraftWriteState[] = [];
    const writer = createNoteDraftWriter(createNoteDraftStore(storage).bind("computer-a"), s => states.push(s));
    for (const body of ["a", "ab", "abc", "abcd"]) { writer.schedule(edit(body)); await vi.advanceTimersByTimeAsync(NOTE_DRAFT_SAVE_DELAY_MS - 1); }
    expect(storage.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(NOTE_DRAFT_SAVE_DELAY_MS);
    expect(storage.writes).toHaveLength(1);
    expect(stored(storage)?.body).toBe("abcd");
    expect(states.map(s => s.status)).toEqual(["pending", "saving", "saved"]);
  });

  it("keeps at most one write in flight and lets the newest draft win behind it", async () => {
    let open!: () => void;
    const storage = disk({ gate: new Promise<void>(resolve => { open = resolve; }) });
    const writer = createNoteDraftWriter(createNoteDraftStore(storage).bind("computer-a"), () => {});
    writer.schedule(edit("first")); const inFlight = writer.flush(); await settle();
    for (const body of ["second", "third", "fourth"]) writer.schedule(edit(body));
    expect(storage.writes).toHaveLength(1);
    open(); await inFlight;
    expect(storage.writes).toHaveLength(2);
    expect(stored(storage)?.body).toBe("fourth");
  });

  it("flushes pending text immediately for background and close without waiting for the timer", async () => {
    const storage = disk();
    const writer = createNoteDraftWriter(createNoteDraftStore(storage).bind("computer-a"), () => {});
    writer.schedule(edit("typed just before backgrounding"));
    await writer.flush();
    expect(stored(storage)?.body).toBe("typed just before backgrounding");
    expect(writer.hasPending).toBe(false);
    await vi.advanceTimersByTimeAsync(NOTE_DRAFT_SAVE_DELAY_MS * 2);
    expect(storage.writes).toHaveLength(1);
  });

  it("reports a failed write, keeps the draft for retry, and lets a newer edit replace it", async () => {
    const storage = disk({ failWrites: 1 }), states: NoteDraftWriteState[] = [];
    const writer = createNoteDraftWriter(createNoteDraftStore(storage).bind("computer-a"), s => states.push(s));
    writer.schedule(edit("unsaved"));
    await expect(writer.flush()).rejects.toThrow("disk full");
    expect(states.at(-1)).toMatchObject({ status: "error" });
    expect(writer.hasPending).toBe(true);
    await writer.flush();
    expect(stored(storage)?.body).toBe("unsaved");
    expect(states.at(-1)?.status).toBe("saved");

    const failing = disk({ failWrites: 1 });
    const second = createNoteDraftWriter(createNoteDraftStore(failing).bind("computer-a"), () => {});
    second.schedule(edit("old"));
    await expect(second.flush()).rejects.toThrow("disk full");
    second.schedule(edit("newer"));
    await vi.advanceTimersByTimeAsync(NOTE_DRAFT_SAVE_DELAY_MS);
    expect(stored(failing)?.body).toBe("newer");
  });

  it("writes through to the owner only; no computer selected is an error, not a lost edit", async () => {
    const writer = createNoteDraftWriter(null, () => {});
    writer.schedule(edit("kept"));
    await expect(writer.flush()).rejects.toThrow("Choose a computer.");
    expect(writer.hasPending).toBe(true);
  });

  it("clear writes pending text first so the matching removal succeeds and nothing is resurrected", async () => {
    const storage = disk(), store = createNoteDraftStore(storage);
    const writer = createNoteDraftWriter(store.bind("computer-a"), () => {});
    writer.schedule(edit("final"));
    await writer.clear(edit("final"));
    expect(storage.values.size).toBe(0);
    await vi.advanceTimersByTimeAsync(NOTE_DRAFT_SAVE_DELAY_MS * 2);
    expect(storage.values.size).toBe(0);
    expect(await store.recover("computer-a")).toBeNull();
  });

  it("does not erase a newer stored edit when clearing an older saved copy", async () => {
    const storage = disk(), store = createNoteDraftStore(storage);
    const writer = createNoteDraftWriter(store.bind("computer-a"), () => {});
    writer.schedule(edit("newer"));
    await writer.clear(edit("older"));
    expect((await store.recover("computer-a"))?.body).toBe("newer");
  });

  it("keeps each computer's draft under its own key", async () => {
    const storage = disk(), store = createNoteDraftStore(storage);
    const a = createNoteDraftWriter(store.bind("computer-a"), () => {});
    const b = createNoteDraftWriter(store.bind("computer-b"), () => {});
    a.schedule(edit("for a")); b.schedule(edit("for b"));
    await Promise.all([a.flush(), b.flush()]);
    expect(stored(storage, "computer-a")?.body).toBe("for a");
    expect(stored(storage, "computer-b")?.body).toBe("for b");
    await a.clear(edit("for a"));
    expect(stored(storage, "computer-b")?.body).toBe("for b");
  });

  it("never recreates a draft the owner was retired from by cleanup", async () => {
    const { withDraftStorageCleanup } = await import("@/state/local-draft-storage");
    const storage = disk(), store = createNoteDraftStore(storage);
    const writer = createNoteDraftWriter(store.bind("computer-a"), () => {});
    writer.schedule(edit("typed"));
    await withDraftStorageCleanup(storage, async retire => { retire(new Set()); });
    await expect(writer.flush()).rejects.toThrow("saved draft was cleared");
    expect(storage.values.size).toBe(0);
  });
});
