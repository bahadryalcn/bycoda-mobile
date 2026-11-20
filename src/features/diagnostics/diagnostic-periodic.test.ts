import { describe, expect, it, vi } from "vitest";
import { createPeriodicDiagnostics, PERIODIC_RETRY_BACKOFF_MS } from "./diagnostic-periodic";
import { createDiagnosticPrefs, DIAGNOSTIC_PERIODIC_RETRY_KEY, type DiagnosticMode } from "./diagnostic-prefs";
import type { DiagnosticSendResult } from "./diagnostic-report";

const DAY_MS = 86_400_000;

function setup(initial: { mode?: DiagnosticMode | null; last?: Date | null } = {}) {
  const state = {
    mode: initial.mode === undefined ? ("auto" as DiagnosticMode | null) : initial.mode,
    last: initial.last === undefined ? null : initial.last,
    retryAt: null as Date | null,
    now: new Date("2026-11-19T12:00:00.000Z"),
    onReadRetry: () => undefined as void,
  };
  const periodic = createPeriodicDiagnostics({
    mode: () => state.mode,
    readLastSent: async () => state.last,
    writeLastSent: async (at) => void (state.last = at),
    readRetryAt: async () => {
      state.onReadRetry();
      return state.retryAt;
    },
    writeRetryAt: async (at) => void (state.retryAt = at),
    now: () => state.now,
  });
  return { state, periodic };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("periodic diagnostics single flight", () => {
  it("joins a second trigger to the run that is still collecting", async () => {
    const { periodic } = setup();
    const pending = deferred<DiagnosticSendResult>();
    const send = vi.fn(() => pending.promise);
    const first = periodic.run(send);
    const second = periodic.run(send);
    expect(second).toBe(first);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    pending.resolve("sent");
    await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("allows a new run after the first one settled and the retry window passed", async () => {
    const { periodic, state } = setup();
    const send = vi.fn(async (): Promise<DiagnosticSendResult> => "failed");
    await periodic.run(send);
    state.now = new Date(state.now.getTime() + PERIODIC_RETRY_BACKOFF_MS.failed + 1);
    await periodic.run(send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("clears the in-flight run when the upload rejects so the next trigger can run", async () => {
    const { periodic } = setup();
    const send = vi.fn<() => Promise<DiagnosticSendResult>>().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("sent");
    await expect(periodic.run(send)).rejects.toThrow("boom");
    await periodic.run(send);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("periodic diagnostics results", () => {
  it("records the weekly date only after a sent report", async () => {
    const { periodic, state } = setup();
    await periodic.run(async () => "sent");
    expect(state.last).toEqual(state.now);
    expect(state.retryAt).toBeNull();
  });

  it.each(["failed", "rate-limited", "not-configured", "empty"] as const)(
    "records a retry time and not the weekly date for %s",
    async (result) => {
      const { periodic, state } = setup();
      await periodic.run(async () => result);
      expect(state.last).toBeNull();
      expect(state.retryAt).toEqual(new Date(state.now.getTime() + PERIODIC_RETRY_BACKOFF_MS[result]));
    },
  );

  it.each(["failed", "rate-limited", "not-configured", "empty"] as const)(
    "does not rebuild the report on a foreground inside the %s backoff",
    async (result) => {
      const { periodic, state } = setup();
      const send = vi.fn(async (): Promise<DiagnosticSendResult> => result);
      await periodic.run(send);
      state.now = new Date(state.now.getTime() + 60_000);
      await periodic.run(send);
      expect(send).toHaveBeenCalledTimes(1);
      state.now = new Date(state.now.getTime() + PERIODIC_RETRY_BACKOFF_MS[result]);
      await periodic.run(send);
      expect(send).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps the longer wait for results that cannot improve on their own", () => {
    expect(PERIODIC_RETRY_BACKOFF_MS.failed).toBeLessThan(PERIODIC_RETRY_BACKOFF_MS["not-configured"]);
    expect(PERIODIC_RETRY_BACKOFF_MS["rate-limited"]).toBe(DAY_MS);
  });
});

describe("periodic diagnostics consent", () => {
  it("does nothing before the weekly interval has passed", async () => {
    const { periodic, state } = setup({ last: new Date("2026-11-18T12:00:00.000Z") });
    const send = vi.fn(async (): Promise<DiagnosticSendResult> => "sent");
    await periodic.run(send);
    expect(send).not.toHaveBeenCalled();
    expect(state.retryAt).toBeNull();
  });

  it.each(["off", "ask", null] as const)("never sends when the mode is %s", async (mode) => {
    const { periodic } = setup({ mode });
    const send = vi.fn(async (): Promise<DiagnosticSendResult> => "sent");
    await periodic.run(send);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send when consent is withdrawn while the stored dates are read", async () => {
    const { periodic, state } = setup();
    state.onReadRetry = () => {
      state.mode = "off";
    };
    const send = vi.fn(async (): Promise<DiagnosticSendResult> => "sent");
    await periodic.run(send);
    expect(send).not.toHaveBeenCalled();
    expect(state.last).toBeNull();
    expect(state.retryAt).toBeNull();
  });
});

describe("periodic retry preference", () => {
  const storage = () => {
    const map = new Map<string, string>();
    return { map, getItem: async (key: string) => map.get(key) ?? null, setItem: async (key: string, value: string) => void map.set(key, value) };
  };

  it("round-trips the retry time and treats a broken value as absent", async () => {
    const backing = storage();
    const prefs = createDiagnosticPrefs(backing);
    expect(await prefs.readPeriodicRetryAt()).toBeNull();
    await prefs.writePeriodicRetryAt(new Date("2026-11-20T00:00:00.000Z"));
    expect(await prefs.readPeriodicRetryAt()).toEqual(new Date("2026-11-20T00:00:00.000Z"));
    backing.map.set(DIAGNOSTIC_PERIODIC_RETRY_KEY, "not a date");
    expect(await prefs.readPeriodicRetryAt()).toBeNull();
  });

  it("keeps the retry time apart from the weekly date", async () => {
    const prefs = createDiagnosticPrefs(storage());
    await prefs.writePeriodicRetryAt(new Date("2026-11-20T00:00:00.000Z"));
    expect(await prefs.readLastPeriodic()).toBeNull();
  });
});
