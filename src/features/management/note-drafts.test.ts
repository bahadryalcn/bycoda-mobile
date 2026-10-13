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
