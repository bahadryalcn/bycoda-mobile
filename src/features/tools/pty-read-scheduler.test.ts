import { afterEach, expect, it, vi } from "vitest";
import { PtyReadScheduler } from "./pty-read-scheduler";
afterEach(() => vi.useRealTimers());

it("drains a 1MiB burst only after each renderer ACK instead of waiting 200ms per chunk", async () => {
  vi.useFakeTimers(); let waiting = false; let cursor = 0;
  const read = vi.fn(async () => { waiting = true; cursor += 32768; return { output: true, hasMore: cursor < 1024 * 1024 }; });
  const scheduler = new PtyReadScheduler(() => !waiting, read);
  scheduler.wake(); await vi.advanceTimersByTimeAsync(0);
  for (let i = 1; i < 32; i++) {
    expect(read).toHaveBeenCalledTimes(i);
    await vi.advanceTimersByTimeAsync(10);
    expect(read).toHaveBeenCalledTimes(i);
    waiting = false; scheduler.wake(); await vi.advanceTimersByTimeAsync(0);
  }
  expect(cursor).toBe(1024 * 1024);
  expect(read).toHaveBeenCalledTimes(32);
  scheduler.stop();
});
it("backs off an idle terminal and never overlaps a read or restarts after stop", async () => {
  vi.useFakeTimers();
  const idle = vi.fn(async () => ({ output: false, hasMore: false }));
  const scheduler = new PtyReadScheduler(() => true, idle);
  scheduler.wake(); await vi.advanceTimersByTimeAsync(30_000);
  expect(idle.mock.calls.length).toBeLessThanOrEqual(20);
  scheduler.stop(); const count = idle.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10_000); expect(idle).toHaveBeenCalledTimes(count);
  let finish!: (result: { output: boolean; hasMore: boolean }) => void;
  const read = vi.fn(() => new Promise<{ output: boolean; hasMore: boolean }>((resolve) => { finish = resolve; }));
  const blocked = new PtyReadScheduler(() => true, read);
  blocked.wake(); await vi.advanceTimersByTimeAsync(0); blocked.wake(); await vi.advanceTimersByTimeAsync(500);
  expect(read).toHaveBeenCalledTimes(1);
  blocked.stop(); finish({ output: false, hasMore: true }); await vi.advanceTimersByTimeAsync(500);
  expect(read).toHaveBeenCalledTimes(1);
});
