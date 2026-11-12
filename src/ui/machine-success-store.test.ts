import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { machineSuccessStore } from "./machine-success-store";

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
