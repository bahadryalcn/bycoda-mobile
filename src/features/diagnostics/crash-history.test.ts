import { expect, it } from "vitest";
import { archiveCrashMarker, CRASH_HISTORY, CRASH_HISTORY_LIMIT, formatCrashLog, readCrashHistory } from "./crash-history";
import { CRASH_MARKER, type DiagnosticFiles } from "./diagnostic-files";

function memoryFiles(initial: Record<string, string> = {}): DiagnosticFiles & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, read: (name) => data[name] ?? null, write: (name, text) => { data[name] = text; }, remove: (name) => { delete data[name]; } };
}
const marker = (n: number) => JSON.stringify({ message: `boom ${n}`, stack: "at x", occurredAt: new Date(1_700_000_000_000 + n * 1000).toISOString(), appVersion: "1.0.0" });

it("archives a pending marker once and keeps it after the marker is cleared", () => {
  const files = memoryFiles({ [CRASH_MARKER]: marker(1) });
  archiveCrashMarker(files);
  archiveCrashMarker(files);
  files.remove(CRASH_MARKER);
  expect(readCrashHistory(files).map((crash) => crash.message)).toEqual(["boom 1"]);
});

it("keeps the newest crashes only", () => {
  const files = memoryFiles();
  for (let n = 1; n <= CRASH_HISTORY_LIMIT + 2; n++) {
    files.write(CRASH_MARKER, marker(n));
    archiveCrashMarker(files);
  }
  const history = readCrashHistory(files);
  expect(history).toHaveLength(CRASH_HISTORY_LIMIT);
  expect(history[0]!.message).toBe(`boom ${CRASH_HISTORY_LIMIT + 2}`);
});

it("treats malformed history as empty and formats a crash for copying", () => {
  expect(readCrashHistory(memoryFiles({ [CRASH_HISTORY]: "{" }))).toEqual([]);
  expect(readCrashHistory(memoryFiles({ [CRASH_HISTORY]: JSON.stringify([{ message: 1 }]) }))).toEqual([]);
  const text = formatCrashLog({ message: "boom", stack: "at x", occurredAt: "2026-01-01T00:00:00.000Z", appVersion: "1.2.3" });
  expect(text).toBe("bycoda mobile 1.2.3\nCrashed at 2026-01-01T00:00:00.000Z\n\nboom\nat x");
});
