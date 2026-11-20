import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/state/queries", () => ({ useHostClient: vi.fn() }));
vi.mock("@/state/security", () => ({ useSecurity: vi.fn(), isAppContentVisible: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("./store", () => ({ sendOutbox: {} }));
import { publishDraftPresence, withDraftStorageCleanup } from "@/state/local-draft-storage";
import {
  DRAFT_PRESENCE_RENEW_MS, draftPresenceBackoff, draftPresenceChanged, draftPresenceConnected, draftPresenceSnapshot,
  startDraftPresenceReporting,
} from "./draft-presence-reporter";
const raw = (text: string) => `bycoda-composer-v2:\n${JSON.stringify({ version: 2, text, attachments: [], selectedMentionRefs: [] })}`;
it("includes text, attachments and pending outbox; scopes to computer and deduplicates", () => {
  expect(draftPresenceSnapshot("m", [
    ["bycoda.mobile.draft.v1:m:text", raw("hello")],
    ["bycoda.mobile.draft.v1:m:empty", raw("")],
    ["bycoda.mobile.draft.v1:other:secret", raw("secret")],
    ["bycoda.mobile.draft.v1:m:attachment", `bycoda-composer-v2:\n${JSON.stringify({ version: 2, text: "", selectedMentionRefs: [], attachments: [{ id: "b4772320-03db-4cd1-8c38-03c346f4ffb5", uri: "file:/draft", name: "draft.txt", mimeType: "text/plain", kind: "file", size: 1 }] })}`],
  ], [
    { machineId: "m", sessionId: "queued", status: "waiting" },
    { machineId: "m", sessionId: "text", status: "blocked" },
    { machineId: "m", sessionId: "sent", status: "delivered" },
    { machineId: "other", sessionId: "other", status: "waiting" },
  ])).toEqual(["attachment", "queued", "text"]);
});
it("malformed persisted drafts never become clean clearance", () => {
  expect(() => draftPresenceSnapshot("m", [["bycoda.mobile.draft.v1:m:s", "bycoda-composer-v2:\n{broken"]], [])).toThrow();
});
it("diff sends initial full snapshot, updates and clearing; unchanged skips", () => {
  expect(draftPresenceChanged(undefined, [])).toBe(true);
  expect(draftPresenceChanged([], [])).toBe(false);
  expect(draftPresenceChanged([], ["s"])).toBe(true);
  expect(draftPresenceChanged(["s"], [])).toBe(true);
});

describe("event-driven reporting", () => {
  const prefix = "bycoda.mobile.draft.v1:m:";
  function setup(options: { report?: (ids: string[]) => Promise<unknown>; current?: () => boolean } = {}) {
    const items = new Map<string, string>();
    const storage = { getAllKeys: vi.fn(async () => [...items.keys()]), multiGet: vi.fn(async (keys: readonly string[]) => keys.map(key => [key, items.get(key) ?? null] as const)) };
    const reports: string[][] = [];
    const report = vi.fn(options.report ?? (async (ids: string[]) => { reports.push(ids); }));
    const outbox = { all: vi.fn(async () => []), subscribe: vi.fn(() => () => {}) };
    const stop = startDraftPresenceReporting({ machineId: "m", storage, outbox, flush: async () => {}, report, current: options.current ?? (() => true) });
    const write = (id: string, text = "hello", machine = "m") => {
      items.set(`bycoda.mobile.draft.v1:${machine}:${id}`, raw(text));
      publishDraftPresence(storage, `bycoda.mobile.draft.v1:${machine}:${id}`, true);
    };
    return { storage, outbox, report, reports, stop, write, items };
  }
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("reports on cold start, then neither scans nor reports while idle until renewal", async () => {
    const { storage, outbox, report, stop } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(report).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DRAFT_PRESENCE_RENEW_MS - 1);
    expect(storage.getAllKeys).toHaveBeenCalledTimes(1);
    expect(outbox.all).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(report).toHaveBeenCalledTimes(2);
    stop();
  });

  it("a draft appearing in this computer's scope is reported after the debounce; other computers are ignored", async () => {
    const { storage, reports, write, stop } = setup();
    await vi.advanceTimersByTimeAsync(0);
    write("s1", "hello", "other");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(storage.getAllKeys).toHaveBeenCalledTimes(1);
    write("s1");
    await vi.advanceTimersByTimeAsync(399);
    expect(reports).toEqual([[]]);
    await vi.advanceTimersByTimeAsync(1);
    expect(reports).toEqual([[], ["s1"]]);
    stop();
  });

  it("a cleanup rescans keys that never had a presence entry", async () => {
    const { reports, items, storage, stop } = setup();
    items.set(`${prefix}old`, raw("kept"));
    await vi.advanceTimersByTimeAsync(0);
    expect(reports).toEqual([["old"]]);
    items.delete(`${prefix}old`);
    await withDraftStorageCleanup(storage, async () => {});
    await vi.advanceTimersByTimeAsync(400);
    expect(reports).toEqual([["old"], []]);
    stop();
  });

  it("a failed report backs off exponentially, keeps the snapshot pending and recovers", async () => {
    let failing = 3;
    const { report, stop } = setup({ report: async () => { if (failing-- > 0) throw new Error("host down"); } });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(report).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(report).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(report).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(report).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(report).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(report).toHaveBeenCalledTimes(4);
    expect(draftPresenceBackoff(1)).toBe(2_000);
    expect(draftPresenceBackoff(20)).toBe(60_000);
    stop();
  });

  it("a trigger during backoff waits for the retry instead of reporting immediately", async () => {
    let failing = true;
    const { report, write, stop } = setup({ report: async () => { if (failing) throw new Error("host down"); } });
    await vi.advanceTimersByTimeAsync(0);
    failing = false;
    write("s1");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(report).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(report).toHaveBeenCalledTimes(2);
    stop();
  });

  it("an edit made while a report is in flight is reported by a follow-up run", async () => {
    let release!: () => void;
    const first = new Promise<void>(resolve => { release = resolve; });
    const calls: string[][] = [];
    const { write, stop } = setup({ report: async ids => { calls.push(ids); if (calls.length === 1) await first; } });
    await vi.advanceTimersByTimeAsync(0);
    write("s1");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toEqual([[]]);
    release();
    await vi.advanceTimersByTimeAsync(400);
    expect(calls).toEqual([[], ["s1"]]);
    stop();
  });

  it("a reconnect resets the failure backoff and reports the full snapshot again", async () => {
    let failing = true;
    const { report, stop } = setup({ report: async () => { if (failing) throw new Error("host down"); } });
    await vi.advanceTimersByTimeAsync(0);
    failing = false;
    draftPresenceConnected("other");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(report).toHaveBeenCalledTimes(1);
    draftPresenceConnected("m");
    await vi.advanceTimersByTimeAsync(400);
    expect(report).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    draftPresenceConnected("m");
    await vi.advanceTimersByTimeAsync(400);
    expect(report).toHaveBeenCalledTimes(3);
    stop();
  });

  it("does nothing while the app is not current, and stop cancels pending timers", async () => {
    const hidden = setup({ current: () => false });
    await vi.advanceTimersByTimeAsync(DRAFT_PRESENCE_RENEW_MS * 2);
    expect(hidden.storage.getAllKeys).not.toHaveBeenCalled();
    hidden.stop();
    const live = setup();
    await vi.advanceTimersByTimeAsync(0);
    live.write("s1");
    live.stop();
    await vi.advanceTimersByTimeAsync(DRAFT_PRESENCE_RENEW_MS * 2);
    expect(live.report).toHaveBeenCalledTimes(1);
  });
});
