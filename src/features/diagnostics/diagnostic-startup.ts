import { DIAGNOSTIC_PERIODIC_INTERVAL_DAYS } from "../account/contracts";
import { CRASH_MARKER, type DiagnosticFiles } from "./diagnostic-files";
import { readCrashMarker, type CrashMarker } from "./diagnostic-capture";
import { effectiveMode, periodicDue, type DiagnosticMode } from "./diagnostic-prefs";

export type StartupAction =
  | { kind: "none" }
  | { kind: "send-crash"; marker: CrashMarker }
  | { kind: "prompt"; marker: CrashMarker };

/** What to do with a crash marker left by the previous run; `off` (or an unreadable marker) discards it. */
export function decideStartup(files: DiagnosticFiles, mode: DiagnosticMode | null): StartupAction {
  const marker = readCrashMarker(files);
  if (!marker || effectiveMode(mode) === "off") {
    files.remove(CRASH_MARKER);
    return { kind: "none" };
  }
  return effectiveMode(mode) === "auto" ? { kind: "send-crash", marker } : { kind: "prompt", marker };
}

export const shouldSendPeriodic = (mode: DiagnosticMode | null, last: Date | null, now: Date) =>
  mode === "auto" && periodicDue(last, now, DIAGNOSTIC_PERIODIC_INTERVAL_DAYS);
