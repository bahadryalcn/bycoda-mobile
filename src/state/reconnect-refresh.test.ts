import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { projectPrivacyKey } from "../features/workspace/project-privacy-cache";
import {
  createReconnectRefresh,
  RECONNECT_DEBOUNCE_MS,
  RECONNECT_WAVE_GAP_MS,
  RECONNECT_WAVE_SIZE,
} from "./reconnect-refresh";

function setup(canRun: () => boolean = () => true) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const calls = new Map<string, number>();
  const unsubscribe: (() => void)[] = [];
  /** A mounted query holding old data; `enabled: false` models a stack route behind the front one. */
  const observe = (key: unknown[], options: { staleTime?: number; enabled?: boolean } = {}) => {
    const id = JSON.stringify(key);
    calls.set(id, 0);
    cache.setQueryData(key, "old");
    const observer = new QueryObserver(cache, {
      queryKey: key,
      queryFn: () => {
        calls.set(id, (calls.get(id) ?? 0) + 1);
        return "new";
      },
      staleTime: options.staleTime ?? 0,
      enabled: options.enabled ?? true,
      refetchOnMount: false,
    });
    unsubscribe.push(observer.subscribe(() => undefined));
  };
  const fetched = (key: unknown[]) => calls.get(JSON.stringify(key)) ?? 0;
  const total = () => [...calls.values()].reduce((sum, count) => sum + count, 0);
  const refresh = createReconnectRefresh(cache, { canRun, random: () => 0 });
  return { cache, observe, fetched, total, refresh, unsubscribe };
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe("createReconnectRefresh", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("collapses a flapping link into one refresh after the quiet period", async () => {
    const { observe, fetched, refresh } = setup();
    observe(["machine", "pc", "a"]);
    refresh.schedule("pc");
    await advance(RECONNECT_DEBOUNCE_MS - 100);
    refresh.schedule("pc");
    await advance(RECONNECT_DEBOUNCE_MS - 100);
    expect(fetched(["machine", "pc", "a"])).toBe(0);
    await advance(200);
    expect(fetched(["machine", "pc", "a"])).toBe(1);
    await advance(10_000);
    expect(fetched(["machine", "pc", "a"])).toBe(1);
  });

  it("starts at most one wave of reads at a time and spreads the rest", async () => {
    const { observe, total, refresh } = setup();
    const keys = Array.from({ length: RECONNECT_WAVE_SIZE * 2 + 1 }, (_, index) => ["machine", "pc", `q${index}`]);
    keys.forEach((key) => observe(key));
    refresh.schedule("pc");
    await advance(RECONNECT_DEBOUNCE_MS);
    expect(total()).toBe(RECONNECT_WAVE_SIZE);
    await advance(RECONNECT_WAVE_GAP_MS);
    expect(total()).toBe(RECONNECT_WAVE_SIZE * 2);
    await advance(RECONNECT_WAVE_GAP_MS);
    expect(total()).toBe(keys.length);
  });

  it("skips fresh reads, project privacy proof and other computers", async () => {
    const { observe, fetched, refresh } = setup();
    observe(["machine", "pc", "fresh"], { staleTime: 60_000 });
    observe(["machine", "pc", "stale"]);
    observe(projectPrivacyKey("pc", true));
    observe(projectPrivacyKey("pc", false));
    observe(["machine", "other", "stale"]);
    refresh.schedule("pc");
    await advance(RECONNECT_DEBOUNCE_MS + RECONNECT_WAVE_GAP_MS);
    expect(fetched(["machine", "pc", "fresh"])).toBe(0);
    expect(fetched(["machine", "pc", "stale"])).toBe(1);
    expect(fetched(projectPrivacyKey("pc", true))).toBe(0);
    expect(fetched(projectPrivacyKey("pc", false))).toBe(0);
    expect(fetched(["machine", "other", "stale"])).toBe(0);
  });

  it("only marks reads behind the front screen stale instead of fetching them", async () => {
    const { cache, observe, fetched, refresh } = setup();
    observe(["machine", "pc", "hidden"], { enabled: false });
    observe(["machine", "pc", "visible"]);
    refresh.schedule("pc");
    await advance(RECONNECT_DEBOUNCE_MS);
    expect(fetched(["machine", "pc", "hidden"])).toBe(0);
    expect(cache.getQueryState(["machine", "pc", "hidden"])?.isInvalidated).toBe(true);
    expect(fetched(["machine", "pc", "visible"])).toBe(1);
  });

  it("drops queued reads when the link drops again", async () => {
    const { observe, total, refresh } = setup();
    for (let index = 0; index < RECONNECT_WAVE_SIZE * 2; index++) observe(["machine", "pc", `q${index}`]);
    refresh.schedule("pc");
    await advance(RECONNECT_DEBOUNCE_MS);
    expect(total()).toBe(RECONNECT_WAVE_SIZE);
    refresh.cancel("pc");
    await advance(10_000);
    expect(total()).toBe(RECONNECT_WAVE_SIZE);
  });

  it("starts nothing while the app is locked or in the background, then stays dropped", async () => {
    let allowed = false;
    const { observe, total, refresh } = setup(() => allowed);
    observe(["machine", "pc", "a"]);
    refresh.schedule("pc");
    await advance(RECONNECT_DEBOUNCE_MS);
    allowed = true;
    await advance(10_000);
    expect(total()).toBe(0);
  });

  it("stops queued waves once the app stops being allowed to read", async () => {
    let allowed = true;
    const { observe, total, refresh } = setup(() => allowed);
    for (let index = 0; index < RECONNECT_WAVE_SIZE * 2; index++) observe(["machine", "pc", `q${index}`]);
    refresh.schedule("pc");
    await advance(RECONNECT_DEBOUNCE_MS);
    allowed = false;
    await advance(10_000);
    expect(total()).toBe(RECONNECT_WAVE_SIZE);
  });

  it("does not refetch a queued read whose screen left while it waited", async () => {
    const { observe, fetched, refresh, unsubscribe } = setup();
    const keys = Array.from({ length: RECONNECT_WAVE_SIZE + 2 }, (_, index) => ["machine", "pc", `q${index}`]);
    keys.forEach((key) => observe(key));
    refresh.schedule("pc");
    await advance(RECONNECT_DEBOUNCE_MS);
    const queued = keys.filter((key) => fetched(key) === 0);
    expect(queued).toHaveLength(2);
    unsubscribe[keys.indexOf(queued[0]!)]!();
    await advance(RECONNECT_WAVE_GAP_MS);
    expect(fetched(queued[0]!)).toBe(0);
    expect(fetched(queued[1]!)).toBe(1);
  });
});
