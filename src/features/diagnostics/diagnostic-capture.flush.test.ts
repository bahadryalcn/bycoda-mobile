import { describe, expect, it, vi } from "vitest";
import { installDiagnosticCapture } from "./diagnostic-capture";
import { CURRENT_LOG, type DiagnosticFiles } from "./diagnostic-files";

function countingFiles(): DiagnosticFiles & { writes: () => number } {
  const map = new Map<string, string>();
  let writes = 0;
  return {
    writes: () => writes,
    read: (name) => map.get(name) ?? null,
    write: (name, text) => {
      writes += 1;
      map.set(name, text);
    },
    remove: (name) => void map.delete(name),
  };
}

describe("capture flush scheduling", () => {
  it("skips the rewrite when nothing changed since the last flush", () => {
    const files = countingFiles();
    const consoleLike = { warn: vi.fn(), error: vi.fn() };
    const capture = installDiagnosticCapture({
      files,
      console: consoleLike,
      appVersion: "1.0.0",
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    capture.flush();
    expect(files.writes()).toBe(1);
    capture.flush();
    capture.flush();
    expect(files.writes()).toBe(1);
    consoleLike.warn("new");
    capture.flush();
    expect(files.writes()).toBe(2);
    expect(files.read(CURRENT_LOG)).toContain("new");
  });

  it("schedules the periodic flush with the production delay outside dev builds", () => {
    const delays: number[] = [];
    const consoleLike = { warn: vi.fn(), error: vi.fn() };
    installDiagnosticCapture({
      files: countingFiles(),
      console: consoleLike,
      appVersion: "1.0.0",
      setTimer: (_run, ms) => void delays.push(ms),
      clearTimer: () => undefined,
    });
    expect(delays).toEqual([3000]);
  });
});
