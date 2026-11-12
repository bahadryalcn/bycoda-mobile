import { describe, expect, it } from "vitest";
import { createBusySendStore, decodeBusySendMode } from "./busy-send";

const memory = (initial: string | null) => {
  let value = initial;
  return { getItem: async () => value, setItem: async (_: string, next: string) => { value = next; } };
};
describe("busy send preference", () => {
  it("defaults to steer and ignores garbage", () => {
    expect(decodeBusySendMode(null)).toBe("steer");
    expect(decodeBusySendMode("x")).toBe("steer");
  });
  it("hydrates and persists", async () => {
    const storage = memory("queue");
    const store = createBusySendStore(storage);
    await store.getState().hydrate();
    expect(store.getState().mode).toBe("queue");
    await store.getState().setMode("steer");
    expect(await storage.getItem()).toBe("steer");
  });
  it("keeps a choice made before hydration finished", async () => {
    const store = createBusySendStore(memory("queue"));
    const pending = store.getState().hydrate();
    await store.getState().setMode("steer");
    await pending;
    expect(store.getState().mode).toBe("steer");
  });
});
