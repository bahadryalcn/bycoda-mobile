import { describe, expect, it, vi } from "vitest";
import { installDiagnosticCapture } from "./diagnostic-capture";
import { CURRENT_LOG, PREVIOUS_LOG, type DiagnosticFiles } from "./diagnostic-files";
import { LOG_MAX_LINES } from "./log-buffer";

function countingFiles(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const calls = { writes: 0, appends: [] as string[], failAppends: 0 };
  const files: DiagnosticFiles & { calls: typeof calls } = {
    calls,
    read: (name) => map.get(name) ?? null,
    write: (name, text) => {
      calls.writes += 1;
      map.set(name, text);
    },
    append: (name, text) => {
      if (calls.failAppends > 0) {
        calls.failAppends -= 1;
        throw new Error("disk full");
      }
      calls.appends.push(text);
      map.set(name, (map.get(name) ?? "") + text);
    },
    remove: (name) => void map.delete(name),
  };
  return files;
}

function install(files: DiagnosticFiles, delays: number[] = []) {
  const consoleLike = { warn: vi.fn(), error: vi.fn() };
  const capture = installDiagnosticCapture({
    files,
    console: consoleLike,
    appVersion: "1.0.0",
    setTimer: (_run, ms) => {
      delays.push(ms);
      return delays.length;
    },
    clearTimer: () => undefined,
  });
  return { capture, consoleLike, delays };
}

describe("capture flush scheduling", () => {
  it("skips the write when nothing changed since the last flush", () => {
    const files = countingFiles();
    const { capture, consoleLike } = install(files);
    capture.flush();
    expect(files.calls.writes).toBe(1);
    capture.flush();
    capture.flush();
    expect(files.calls.writes).toBe(1);
    expect(files.calls.appends).toEqual([]);
    consoleLike.warn("new");
    capture.flush();
    expect(files.calls.writes).toBe(1);
    expect(files.read(CURRENT_LOG)).toContain("new");
  });

  it("schedules the periodic flush with the production delay outside dev builds", () => {
    const { delays } = install(countingFiles());
    expect(delays).toEqual([3000]);
  });
});

describe("capture persistence", () => {
  it("replaces the previous run's file on the first flush instead of appending to it", () => {
    const files = countingFiles({ [CURRENT_LOG]: "old run line" });
    const { capture } = install(files);
    capture.flush();
    // One write rotates the old run to previous.log, one replaces current.log whole.
    expect(files.calls.writes).toBe(2);
    expect(files.calls.appends).toEqual([]);
    expect(files.read(PREVIOUS_LOG)).toBe("old run line");
    expect(files.read(CURRENT_LOG)).not.toContain("old run line");
  });

  it("appends only the lines logged since the last flush", () => {
    const files = countingFiles();
    const { capture, consoleLike } = install(files);
    capture.flush();
    consoleLike.warn("first");
    consoleLike.error("second");
    capture.flush();
    expect(files.calls.writes).toBe(1);
    expect(files.calls.appends).toHaveLength(1);
    expect(files.calls.appends[0]).toMatch(/^\n.*first\n.*second$/s);
    expect(files.calls.appends[0]).not.toContain("cold start");
    // The file equals what a full rewrite would have produced.
    capture.dispose();
    expect(files.read(CURRENT_LOG)!.split("\n")).toHaveLength(3);
  });

  it("flushes the repeat summary as an appended line", () => {
    const files = countingFiles();
    const { capture, consoleLike } = install(files);
    capture.flush();
    for (let i = 0; i < 3; i++) consoleLike.warn("same");
    capture.flush();
    expect(files.read(CURRENT_LOG)).toContain("previous event repeated 2 times");
  });

  it("rewrites from the ring once appended lines would exceed the log bound", () => {
    const files = countingFiles();
    const { capture, consoleLike } = install(files);
    capture.flush();
    for (let i = 0; i < LOG_MAX_LINES + 20; i++) consoleLike.warn(`distinct ${i}`);
    capture.flush();
    expect(files.calls.writes).toBe(2);
    const lines = files.read(CURRENT_LOG)!.split("\n");
    expect(lines.length).toBeLessThanOrEqual(LOG_MAX_LINES);
    expect(lines.at(-1)).toContain(`distinct ${LOG_MAX_LINES + 19}`);
  });

  it("rewrites the whole file after a failed append and keeps every line", () => {
    const files = countingFiles();
    const { capture, consoleLike } = install(files);
    capture.flush();
    consoleLike.warn("kept one");
    files.calls.failAppends = 1;
    expect(() => capture.flush()).not.toThrow();
    consoleLike.warn("kept two");
    capture.flush();
    expect(files.calls.writes).toBe(2);
    const text = files.read(CURRENT_LOG)!;
    expect(text).toContain("kept one");
    expect(text).toContain("kept two");
  });

  it("keeps retrying the flush when the write fails and loses no line", () => {
    const files = countingFiles();
    const write = files.write;
    let failures = 1;
    files.write = (name, text) => {
      if (failures-- > 0) throw new Error("read-only");
      write(name, text);
    };
    const { capture, consoleLike } = install(files);
    consoleLike.warn("survives");
    expect(() => capture.flush()).not.toThrow();
    capture.flush();
    expect(files.read(CURRENT_LOG)).toContain("survives");
  });

  it("persists the newest line immediately on dispose even after a backed-off burst", () => {
    const files = countingFiles();
    const { capture, consoleLike } = install(files);
    capture.flush();
    for (let i = 0; i < 80; i++) consoleLike.warn(`storm ${i}`);
    capture.flush();
    consoleLike.warn("last words");
    capture.dispose();
    expect(files.read(CURRENT_LOG)).toContain("last words");
  });
});

describe("capture message clipping", () => {
  it("collapses events that only differ beyond the kept line length", () => {
    const files = countingFiles();
    const { capture, consoleLike } = install(files);
    const huge = "x".repeat(6000);
    consoleLike.warn(`${huge}A`);
    consoleLike.warn(`${huge}B`);
    capture.flush();
    const text = files.read(CURRENT_LOG)!;
    expect(text.match(/xxxx/g)!.length).toBeGreaterThan(0);
    expect(text).toContain("previous event repeated 1 times");
    expect(text.split("\n").filter((line) => line.includes("[mobile.console]"))).toHaveLength(2);
  });

  it("never stores more than the line limit for one huge warning", () => {
    const files = countingFiles();
    const { capture, consoleLike } = install(files);
    consoleLike.warn("y".repeat(50_000));
    capture.flush();
    const line = files.read(CURRENT_LOG)!.split("\n").find((entry) => entry.includes("yyyy"))!;
    expect(line.length).toBeLessThanOrEqual(4003);
  });
});

describe("capture burst backoff", () => {
  it("doubles the flush delay while a burst continues, caps it, and recovers when quiet", () => {
    const files = countingFiles();
    const delays: number[] = [];
    const { capture, consoleLike } = install(files, delays);
    const burst = () => {
      for (let i = 0; i < 60; i++) consoleLike.warn(`burst ${delays.length} ${i}`);
    };
    capture.flush();
    burst();
    capture.flush();
    burst();
    capture.flush();
    burst();
    capture.flush();
    burst();
    capture.flush();
    burst();
    capture.flush();
    consoleLike.warn("quiet one");
    capture.flush();
    consoleLike.warn("quiet two");
    // Start, then the delay each window began with: base, doubled per burst flush, capped, back to base.
    expect(delays).toEqual([3000, 3000, 6000, 12_000, 24_000, 30_000, 30_000, 3000]);
  });

  it("starts the next window at the base delay after a quiet flush", () => {
    const delays: number[] = [];
    const { capture, consoleLike } = install(countingFiles(), delays);
    for (let i = 0; i < 60; i++) consoleLike.warn(`burst ${i}`);
    capture.flush();
    consoleLike.warn("calm");
    capture.flush();
    consoleLike.warn("calm again");
    expect(delays.at(-1)).toBe(3000);
  });
});
