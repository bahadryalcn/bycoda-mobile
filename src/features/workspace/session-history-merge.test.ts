import { describe, expect, it, vi } from "vitest";
import { keepLoadedHistory } from "./session-history-merge";
import type { HostSession } from "./wire";

const session = (revision: number, before: number | undefined, id = "s1") =>
  ({ revision, session: { id, blocks: [] }, history: { before, revision, totalBlocks: 100 } }) as unknown as HostSession;

describe("keepLoadedHistory", () => {
  it("keeps the held transcript when the reopened stream brings nothing new", async () => {
    const known = session(7, 20);
    const read = vi.fn();
    await expect(keepLoadedHistory(session(7, 80), known, read)).resolves.toBe(known);
    expect(read).not.toHaveBeenCalled();
  });

  it("reads only the changes on top of the held history, including a fully loaded one", async () => {
    const merged = session(9, 20);
    const read = vi.fn(async () => merged);
    await expect(keepLoadedHistory(session(9, 80), session(7, 20), read)).resolves.toBe(merged);
    const whole = session(9, undefined);
    await expect(keepLoadedHistory(session(9, 80), session(7, undefined), async () => whole)).resolves.toBe(whole);
  });

  it("falls back to the stream snapshot when the merge cannot follow the stream", async () => {
    const snapshot = session(9, 80);
    await expect(keepLoadedHistory(snapshot, session(7, 20), async () => session(10, 20))).resolves.toBe(snapshot);
    await expect(keepLoadedHistory(snapshot, session(7, 20), async () => { throw new Error("offline"); })).resolves.toBe(snapshot);
    await expect(keepLoadedHistory(snapshot, session(7, 20, "other"), vi.fn())).resolves.toBe(snapshot);
  });

  it("uses the snapshot when the screen holds no more history than it", async () => {
    const read = vi.fn();
    const snapshot = session(9, 80);
    await expect(keepLoadedHistory(snapshot, session(7, 80), read)).resolves.toBe(snapshot);
    await expect(keepLoadedHistory(snapshot, undefined, read)).resolves.toBe(snapshot);
    expect(read).not.toHaveBeenCalled();
  });
});
