import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { HostTransport } from "../remote/transport";
import { hostKey, hostMutationOptions } from "./host-request";

describe("host mutation destination", () => {
  it("keeps a pending write and its invalidation on the original computer after a scope change", async () => {
    const cache = new QueryClient();
    cache.setQueryData(hostKey("pc-a", ["notes"]), ["a"]);
    cache.setQueryData(hostKey("pc-b", ["notes"]), ["b"]);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writeA = vi.fn(async () => {
      await wait;
      return "saved on A";
    });
    const writeB = vi.fn().mockResolvedValue("saved on B");
    const clientA = { machine: { id: "pc-a" }, request: writeA } as unknown as HostTransport;
    const clientB = { machine: { id: "pc-b" }, request: writeB } as unknown as HostTransport;
    const observer = new MutationObserver(cache, hostMutationOptions<string>(cache));
    const result = observer.mutate({
      client: clientA,
      method: "notes.upsert",
      params: { id: "same-id" },
      invalidate: ["notes"],
    });
    observer.setOptions({
      ...hostMutationOptions<string>(cache),
      mutationKey: hostKey(clientB.machine.id, ["write", "notes.upsert"]),
    });
    release();
    expect(await result).toBe("saved on A");
    expect(writeA).toHaveBeenCalledTimes(1);
    expect(writeB).not.toHaveBeenCalled();
    expect(cache.getQueryState(hostKey("pc-a", ["notes"]))?.isInvalidated).toBe(true);
    expect(cache.getQueryState(hostKey("pc-b", ["notes"]))?.isInvalidated).toBe(false);
    cache.clear();
  });
  it("does not queue or retry a write while no computer is accessible", async () => {
    const cache = new QueryClient();
    const observer = new MutationObserver(cache, hostMutationOptions(cache));
    await expect(
      observer.mutate({ client: null, method: "commands.dispatch", params: {}, invalidate: [] }),
    ).rejects.toThrow("Choose a computer first.");
    expect(observer.getCurrentResult().isError).toBe(true);
    cache.clear();
  });
});
