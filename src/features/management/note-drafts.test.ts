import { describe, expect, it } from "vitest";
import { createNoteDraftStore, type LocalNoteDraft } from "./note-drafts";

const draft: LocalNoteDraft = {
  id: "note-1",
  title: "Title",
  body: "Initial",
  tags: "",
  expectedUpdatedAt: 10,
};
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: async (key: string) => {
      values.delete(key);
    },
  };
}
describe("note draft recovery", () => {
  it("does not erase a newer edit when an earlier save completes", async () => {
    const store = createNoteDraftStore(storage());
    await store.save("computer-a", draft);
    await store.save("computer-a", { ...draft, body: "Newer edit" });
    await store.clearSaved("computer-a", draft);
    expect((await store.recover("computer-a"))?.body).toBe("Newer edit");
  });
  it("keeps each note's draft when another note is edited on the same computer", async () => {
    const store = createNoteDraftStore(storage());
    await store.save("computer-a", { ...draft, body: "Unsaved A" });
    await store.save("computer-a", { ...draft, id: "note-2", body: "B" });
    expect((await store.recover("computer-a", "note-1"))?.body).toBe("Unsaved A");
    expect((await store.recoverAll("computer-a")).map((entry) => entry.id)).toEqual(["note-2", "note-1"]);
    await store.discard("computer-a", "note-2");
    expect((await store.recoverAll("computer-a")).map((entry) => entry.id)).toEqual(["note-1"]);
  });
  it("does not keep a blank new note and reads the earlier single-draft format", async () => {
    const data = storage();
    const store = createNoteDraftStore(data);
    await store.save("computer-a", { ...draft, id: "new", title: "", body: "", expectedUpdatedAt: 0 });
    expect(data.values.size).toBe(0);
    await store.save("computer-a", { ...draft, id: "new", title: "", body: "typed", expectedUpdatedAt: 0 });
    await store.save("computer-a", { ...draft, id: "new", title: "", body: " ", expectedUpdatedAt: 0 });
    expect(data.values.size).toBe(0);
    data.values.set("bycoda.mobile.note-draft.computer-b", JSON.stringify(draft));
    expect(await createNoteDraftStore(data).recover("computer-b")).toEqual(draft);
  });
  it("does not erase another note drafted on the same computer", async () => {
    const store = createNoteDraftStore(storage());
    await store.save("computer-a", { ...draft, id: "note-2" });
    await store.clearSaved("computer-a", draft);
    expect((await store.recover("computer-a"))?.id).toBe("note-2");
  });
  it("recovery waits for queued edits and clearing stays machine scoped", async () => {
    const store = createNoteDraftStore(storage());
    const save = store.save("computer-a", draft);
    const recovered = store.recover("computer-a");
    await save;
    expect(await recovered).toEqual(draft);
    await store.save("computer-b", draft);
    await store.clearSaved("computer-a", draft);
    expect(await store.recover("computer-a")).toBeNull();
    expect(await store.recover("computer-b")).toEqual(draft);
  });
  it("rejects invalid revision timestamps instead of sending malformed recovery data", async () => {
    const data = storage();
    data.values.set(
      "bycoda.mobile.note-draft.computer-a",
      JSON.stringify({ ...draft, expectedUpdatedAt: -1 }),
    );
    await expect(createNoteDraftStore(data).recover("computer-a")).rejects.toThrow(
      "Invalid local note draft.",
    );
  });
});

it("retires an old note owner after cleanup but permits a freshly opened owner", async () => {
  const { withDraftStorageCleanup } = await import("@/state/local-draft-storage");
  const values = new Map<string, string>();
  const disk = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); }, removeItem: async (key: string) => { values.delete(key); } };
  const store = createNoteDraftStore(disk), old = store.bind("computer-a");
  const value: LocalNoteDraft = { id: "note", title: "old", body: "draft", tags: "", expectedUpdatedAt: 0 };
  await old.save(value); await withDraftStorageCleanup(disk, async retire => { retire(new Set()); values.clear(); });
  await expect(old.save(value)).rejects.toThrow("saved draft was cleared"); expect(values.size).toBe(0);
  const fresh = store.bind("computer-a"); expect(await fresh.recover()).toBeNull(); await fresh.save({ ...value, body: "new edit" }); expect(values.size).toBe(1);
});
