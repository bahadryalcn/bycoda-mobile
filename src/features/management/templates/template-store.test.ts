import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));
import { createTemplateStore, TEMPLATE_KEY } from "./template-store";
const row = { id: "one", name: "Review", body: "Review carefully", trigger: "review" };
function storage() {
  return { getItem: vi.fn(async (_key: string): Promise<string | null> => null),
    setItem: vi.fn(async (_key: string, _value: string) => undefined) };
}
describe("phone-local template persistence", () => {
  it("deduplicates loading and persists before publishing the changed snapshot", async () => {
    const adapter = storage();
    const store = createTemplateStore(adapter);
    await Promise.all([store.getState().hydrate(), store.getState().hydrate()]);
    expect(adapter.getItem).toHaveBeenCalledTimes(1);
    let complete!: () => void;
    adapter.setItem.mockImplementationOnce(() => new Promise((resolve) => { complete = () => resolve(undefined); }));
    const pending = store.getState().save([row], []);
    expect(store.getState().rows).toEqual([]);
    expect(store.getState().saving).toBe(true);
    await expect(store.getState().save([row], [])).rejects.toThrow(/Reload/);
    complete(); await pending;
    expect(store.getState().rows).toEqual([row]);
    expect(adapter.setItem).toHaveBeenCalledWith(TEMPLATE_KEY, JSON.stringify([row]));
    await expect(store.getState().save([], [])).rejects.toThrow(/changed/);
  });
  it("does not overwrite corrupt or unavailable storage and reconciles failed writes by a read", async () => {
    const adapter = storage();
    adapter.getItem.mockResolvedValueOnce("{corrupt");
    const store = createTemplateStore(adapter);
    await store.getState().hydrate();
    await expect(store.getState().save([row], [])).rejects.toThrow(/Reload/);
    expect(adapter.setItem).not.toHaveBeenCalled();
    await store.getState().hydrate();
    adapter.setItem.mockRejectedValueOnce(new Error("unavailable"));
    await expect(store.getState().save([row], [])).rejects.toThrow("unavailable");
    expect(store.getState().rows).toEqual([]);
    await expect(store.getState().save([row], [])).rejects.toThrow(/Reload/);
    // A failed persistence result may have written. Read the actual snapshot before editing again.
    adapter.getItem.mockResolvedValueOnce(JSON.stringify([row]));
    await store.getState().hydrate();
    expect(store.getState().rows).toEqual([row]);
  });
});
