// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorRevealDelay, STALE_ERROR_REVEAL_MS, usePersistentError, type PersistentErrorOptions } from "./use-persistent-error";
import { READ_RETRY_GRACE_MS } from "../state/query-retry";
import { holdHostRecoveryClocks, resumeHostRecoveryClocks } from "../state/host-runtime-state";

const failure = (kind?: string) => Object.assign(new Error("failed"), { kind });

describe("errorRevealDelay", () => {
  it("waits out the read grace without data and a minute with data", () => {
    expect(errorRevealDelay(failure("network"))).toBe(READ_RETRY_GRACE_MS);
    expect(errorRevealDelay(failure("host"))).toBe(READ_RETRY_GRACE_MS);
    expect(errorRevealDelay(failure("timeout"), { hasData: true })).toBe(STALE_ERROR_REVEAL_MS);
    expect(errorRevealDelay(failure(), { graceMs: 2_000 })).toBe(2_000);
  });
  it("shows lasting failures and the person's own action at once", () => {
    for (const kind of ["auth", "identity", "unsupported"]) expect(errorRevealDelay(failure(kind), { hasData: true })).toBe(0);
    expect(errorRevealDelay(failure("network"), { userInitiated: true })).toBe(0);
    expect(errorRevealDelay(null)).toBe(0);
  });
});

describe("usePersistentError", () => {
  let root: Root;
  let container: HTMLDivElement;
  function Probe({ error, options }: { error: unknown; options?: PersistentErrorOptions }) {
    const shown = usePersistentError(error, options);
    return createElement("span", null, shown ? "error" : "quiet");
  }
  const render = (error: unknown, options?: PersistentErrorOptions) =>
    act(() => root.render(createElement(Probe, { error, options })));
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("never shows a failure that recovers inside the grace", () => {
    render(failure("network"));
    act(() => vi.advanceTimersByTime(READ_RETRY_GRACE_MS - 1));
    expect(container.textContent).toBe("quiet");
    render(null);
    act(() => vi.advanceTimersByTime(READ_RETRY_GRACE_MS));
    expect(container.textContent).toBe("quiet");
  });
  it("shows a persisting failure and removes it as soon as it recovers", () => {
    const error = failure("timeout");
    render(error);
    act(() => vi.advanceTimersByTime(READ_RETRY_GRACE_MS));
    expect(container.textContent).toBe("error");
    // A retry that replaces the error object keeps the same failure episode on screen.
    render(failure("timeout"));
    expect(container.textContent).toBe("error");
    render(null);
    expect(container.textContent).toBe("quiet");
    // The next failure starts a new grace.
    render(error);
    expect(container.textContent).toBe("quiet");
  });
  it("keeps a failed refresh under shown data quiet for a minute", () => {
    render(failure("host"), { hasData: true });
    act(() => vi.advanceTimersByTime(STALE_ERROR_REVEAL_MS - 1));
    expect(container.textContent).toBe("quiet");
    act(() => vi.advanceTimersByTime(1));
    expect(container.textContent).toBe("error");
  });
  it("reports lasting and user-initiated failures at once", () => {
    render(failure("auth"));
    expect(container.textContent).toBe("error");
    render(failure("network"), { userInitiated: true });
    expect(container.textContent).toBe("error");
  });
  it("starts the grace over after a return to the foreground", () => {
    render(failure("network"));
    act(() => vi.advanceTimersByTime(READ_RETRY_GRACE_MS - 1_000));
    act(() => { holdHostRecoveryClocks(); resumeHostRecoveryClocks(); });
    act(() => vi.advanceTimersByTime(1_000));
    expect(container.textContent).toBe("quiet");
    act(() => vi.advanceTimersByTime(READ_RETRY_GRACE_MS));
    expect(container.textContent).toBe("error");
  });
});
