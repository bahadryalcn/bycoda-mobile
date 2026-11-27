import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { machineSuccessStore, SUCCESS_GRANULARITY_MS } from "./machine-success-store";

it("wakes only for success events of its own computer and never rescans the cache", () => {
  const client = new QueryClient();
  const cache = client.getQueryCache();
  client.setQueryData(["machine", "a", "old"], 1);
  const scan = vi.spyOn(cache, "findAll");
  const store = machineSuccessStore(cache, "a");
  const first = store.getSnapshot();
  expect(first).toBeGreaterThan(0);
  expect(scan).toHaveBeenCalledTimes(1);
  const listener = vi.fn();
  const off = store.subscribe(listener);
  client.setQueryData(["machine", "b", "other"], 2);
  void client.prefetchQuery({ queryKey: ["machine", "a", "pending"], queryFn: () => new Promise(() => {}) });
  expect(listener).not.toHaveBeenCalled();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 5000);
  client.setQueryData(["machine", "a", "new"], 3);
  vi.useRealTimers();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot()).toBeGreaterThan(first);
  expect(scan).toHaveBeenCalledTimes(1);
  off();
  expect(cache.getAll().length).toBeGreaterThan(0);
});

it("publishes streamed successes coarsely, but at once after a failure", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(100_000);
    const client = new QueryClient();
    client.setQueryData(["machine", "a", "session"], 1);
    const store = machineSuccessStore(client.getQueryCache(), "a");
    const listener = vi.fn();
    const off = store.subscribe(listener);
    vi.setSystemTime(101_000);
    client.setQueryData(["machine", "a", "session"], 2);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(100_000);
    vi.setSystemTime(100_000 + SUCCESS_GRANULARITY_MS);
    client.setQueryData(["machine", "a", "session"], 3);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(100_000 + SUCCESS_GRANULARITY_MS);
    vi.setSystemTime(106_000);
    await client
      .fetchQuery({ queryKey: ["machine", "a", "connection"], queryFn: () => Promise.reject(new Error("down")), retry: false })
      .catch(() => undefined);
    vi.setSystemTime(106_500);
    client.setQueryData(["machine", "a", "session"], 4);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toBe(106_500);
    off();
  } finally {
    vi.useRealTimers();
  }
});
