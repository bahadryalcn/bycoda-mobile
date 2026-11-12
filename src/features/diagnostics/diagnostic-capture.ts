import { formatDiagnosticLine, type DiagnosticLogFields, type DiagnosticLogLevel } from "../account/contracts";
import { setDiagnosticSink } from "./diagnostic-log";
import { createLogBuffer, formatLogArguments } from "./log-buffer";
import { CRASH_MARKER, CURRENT_LOG, PREVIOUS_LOG, type DiagnosticFiles } from "./diagnostic-files";

export interface CrashMarker {
  message: string;
  stack: string;
  occurredAt: string;
  appVersion: string;
}

const STACK_MAX = 20_000;
const FLUSH_DELAY_MS = 3000;
// Dev builds log far more and flush less often; the file is rewritten synchronously.
const DEV_FLUSH_DELAY_MS = 10_000;

type ConsoleLike = { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
type ErrorHandler = (error: unknown, isFatal?: boolean) => void;
export type ErrorUtilsLike = { getGlobalHandler(): ErrorHandler; setGlobalHandler(handler: ErrorHandler): void };

export interface CaptureOptions {
  files: DiagnosticFiles;
  console: ConsoleLike;
  errorUtils?: ErrorUtilsLike | null;
  appVersion: string;
  now?: () => Date;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  /** Registers a callback for unhandled promise rejections, when the runtime supports it. */
  trackRejections?: ((onUnhandled: (reason: unknown) => void) => void) | null;
}

export interface DiagnosticCapture {
  flush(): void;
  /** Log text of the previous run followed by this run; empty when there is none. */
  readLog(): string;
  dispose(): void;
}

export function readCrashMarker(files: DiagnosticFiles): CrashMarker | null {
  const raw = files.read(CRASH_MARKER);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CrashMarker>;
    if (typeof value.message !== "string" || typeof value.occurredAt !== "string") return null;
    if (Number.isNaN(new Date(value.occurredAt).getTime())) return null;
    return {
      message: value.message,
      stack: typeof value.stack === "string" ? value.stack : "",
      occurredAt: value.occurredAt,
      appVersion: typeof value.appVersion === "string" ? value.appVersion : "",
    };
  } catch {
    return null;
  }
}

/**
 * Captures console warnings/errors into a bounded buffer persisted to a file so the log of a run
 * that crashed survives, and writes a crash marker from the global error handler. The previous
 * run's file is rotated to `previous.log` when capture starts.
 */
export function installDiagnosticCapture(options: CaptureOptions): DiagnosticCapture {
  const { files, appVersion } = options;
  const now = options.now ?? (() => new Date());
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const rotated = files.read(CURRENT_LOG);
  if (rotated) {
    try {
      files.write(PREVIOUS_LOG, rotated);
    } catch {
      // shortcut: without a writable directory only the current run is reported.
    }
  }
  const previousText = rotated ?? files.read(PREVIOUS_LOG) ?? "";
  const buffer = createLogBuffer();
  const flushDelayMs = typeof __DEV__ !== "undefined" && __DEV__ ? DEV_FLUSH_DELAY_MS : FLUSH_DELAY_MS;
  let timer: unknown = null;
  let disposed = false;
  // Set when the buffer changed since the last successful write, so idle flushes skip the rewrite.
  let dirty = false;

  const flush = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    settleRepeats();
    if (!dirty) return;
    dirty = false;
    try {
      files.write(CURRENT_LOG, buffer.text());
    } catch {
      // Logging must never throw into the app; keep the buffer dirty so the next flush retries.
      dirty = true;
    }
  };
  // Identical consecutive events collapse into one line plus "repeated N times".
  let last: { key: string; level: DiagnosticLogLevel; category: string; message: string; repeats: number } | null = null;
  const settleRepeats = () => {
    if (last && last.repeats > 0) {
      buffer.push(formatDiagnosticLine(now(), last.level, last.category, `previous event repeated ${last.repeats} times`));
      dirty = true;
    }
    if (last) last.repeats = 0;
  };
  const record = (level: DiagnosticLogLevel, category: string, message: string, fields: DiagnosticLogFields = {}) => {
    const key = JSON.stringify([level, category, message, fields]);
    if (last && last.key === key) last.repeats += 1;
    else {
      settleRepeats();
      last = { key, level, category, message, repeats: 0 };
      buffer.push(formatDiagnosticLine(now(), level, category, message, fields));
    }
    dirty = true;
    if (timer === null && !disposed) timer = setTimer(flush, flushDelayMs);
  };

  const originalWarn = options.console.warn;
  const originalError = options.console.error;
  options.console.warn = (...args: unknown[]) => {
    originalWarn.apply(options.console, args);
    record("warn", "mobile.console", formatLogArguments(args));
  };
  options.console.error = (...args: unknown[]) => {
    originalError.apply(options.console, args);
    record("error", "mobile.console", formatLogArguments(args));
  };

  const errorUtils = options.errorUtils ?? null;
  const previousHandler = errorUtils?.getGlobalHandler();
  errorUtils?.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? (error.stack ?? "") : "";
      record("fatal", "mobile.error", stack || message, { appVersion });
      flush();
      try {
        const marker: CrashMarker = {
          message: message.slice(0, 500) || "Unknown error",
          stack: stack.slice(0, STACK_MAX),
          occurredAt: now().toISOString(),
          appVersion,
        };
        files.write(CRASH_MARKER, JSON.stringify(marker));
      } catch {
        // Best effort: the previous handler must still run.
      }
    }
    previousHandler?.(error, isFatal);
  });

  options.trackRejections?.((reason) => {
    record("error", "mobile.error", `Unhandled promise rejection: ${formatLogArguments([reason])}`);
  });

  setDiagnosticSink(record);
  record("info", "mobile.app", "cold start", { appVersion, jsMs: Math.round(globalThis.performance?.now?.() ?? 0) });

  return {
    flush,
    readLog: () => [rotated?.trimEnd() ?? previousText.trimEnd(), buffer.text()].filter(Boolean).join("\n--- app restarted ---\n"),
    dispose() {
      disposed = true;
      flush();
      setDiagnosticSink(null);
      options.console.warn = originalWarn;
      options.console.error = originalError;
      if (errorUtils && previousHandler) errorUtils.setGlobalHandler(previousHandler);
    },
  };
}
