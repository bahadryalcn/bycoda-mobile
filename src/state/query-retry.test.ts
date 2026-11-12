import { describe, expect, it, vi } from "vitest";
import { isTransientConnectionError, reconnectRefetchDelay, refetchRecoveredReads, retryTransientRead } from "./query-retry";

describe("transient read retry", () => {
  it("retries network and timeout failures twice, never auth or protocol", () => {
    expect(retryTransientRead(0, { kind: "network" })).toBe(true);
    expect(retryTransientRead(1, { kind: "timeout" })).toBe(true);
    expect(retryTransientRead(2, { kind: "network" })).toBe(false);
    // A busy Host is retried longer before the screen shows an error.
    expect(retryTransientRead(3, { kind: "host", transient: true })).toBe(true);
    expect(retryTransientRead(4, { kind: "host", transient: true })).toBe(false);
    // Live streams surface the raw socket failure, which carries a category instead of a kind.
    expect(isTransientConnectionError({ category: "overload" })).toBe(true);
    expect(isTransientConnectionError({ category: "authentication" })).toBe(false);
    for (const kind of ["auth", "identity", "protocol", "host", "unsupported"])
      expect(retryTransientRead(0, { kind })).toBe(false);
    expect(isTransientConnectionError(new Error("x"))).toBe(false);
    expect(isTransientConnectionError({ kind: "aborted" })).toBe(true);
    expect(isTransientConnectionError({ kind: "host", transient: true })).toBe(true);
    expect(isTransientConnectionError({ kind: "host", transient: true, uncertain: true })).toBe(false);
    expect(isTransientConnectionError({ kind: "host" })).toBe(false);
    expect(isTransientConnectionError({ kind: "aborted", uncertain: true })).toBe(false);
  });
  it("backs the visible refetch off to a cap", () => {
    expect([0, 1, 2, 3, 9].map(reconnectRefetchDelay)).toEqual([3000, 6000, 12000, 15000, 15000]);
  });
});

describe("refetchRecoveredReads", () => {
  it("reloads reads that gave up during an outage once the computer answers again", () => {
    const query = (key: string, status: string, error: unknown, errorUpdatedAt: number) => ({
      queryKey: ["machine", "pc", key],
      state: { status, error, errorUpdatedAt },
    });
    const refetchQueries = vi.fn(() => Promise.resolve());
    const cache = {
      getQueryCache: () => ({
        findAll: () => [
          query("projects", "error", { kind: "network" }, 100),
          query("later", "error", { kind: "network" }, 300),
          query("denied", "error", { kind: "auth" }, 100),
          query("fine", "success", null, 0),
        ],
      }),
      refetchQueries,
    };
    refetchRecoveredReads(cache, "pc", 200);
    expect(refetchQueries).toHaveBeenCalledTimes(1);
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ["machine", "pc", "projects"],
      exact: true,
      type: "active",
    });
  });
});
