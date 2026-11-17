import { redactDiagnosticText } from "../account/contracts";
import { readCrashMarker, type CrashMarker } from "./diagnostic-capture";
import type { DiagnosticFiles } from "./diagnostic-files";

/** Persisted ring of recent fatal errors; the single crash marker is cleared once a report is handled. */
export const CRASH_HISTORY = "crash-history.json";
export const CRASH_HISTORY_LIMIT = 5;

function isCrash(value: unknown): value is CrashMarker {
  const crash = value as Partial<CrashMarker> | null;
  return (
    !!crash &&
    typeof crash.message === "string" &&
    typeof crash.stack === "string" &&
    typeof crash.appVersion === "string" &&
    typeof crash.occurredAt === "string" &&
    !Number.isNaN(new Date(crash.occurredAt).getTime())
  );
}

/** Newest first; unreadable or malformed history reads as empty. */
export function readCrashHistory(files: DiagnosticFiles): CrashMarker[] {
  try {
    const value: unknown = JSON.parse(files.read(CRASH_HISTORY) ?? "[]");
    return Array.isArray(value) ? value.filter(isCrash).slice(0, CRASH_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Copies the pending crash marker into the history once; call before anything clears the marker. */
export function archiveCrashMarker(files: DiagnosticFiles): void {
  const marker = readCrashMarker(files);
  if (!marker) return;
  const history = readCrashHistory(files);
  if (history.some((crash) => crash.occurredAt === marker.occurredAt && crash.message === marker.message)) return;
  try {
    files.write(CRASH_HISTORY, JSON.stringify([marker, ...history].slice(0, CRASH_HISTORY_LIMIT)));
  } catch {
    // Best effort: the crash report flow does not depend on the history.
  }
}

/** Plain text for pasting into an issue, with secrets, e-mail addresses and user names redacted. */
export function formatCrashLog(crash: CrashMarker): string {
  const body = [crash.message, crash.stack].filter(Boolean).join("\n");
  return [
    `bycoda mobile ${crash.appVersion || "unknown version"}`,
    `Crashed at ${crash.occurredAt}`,
    "",
    redactDiagnosticText(body),
  ].join("\n").trimEnd();
}
