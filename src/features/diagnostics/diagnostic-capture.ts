import { formatDiagnosticLine, type DiagnosticLogFields, type DiagnosticLogLevel } from "../account/contracts";
import { setDiagnosticSink } from "./diagnostic-log";
import { createLogBuffer, formatLogArguments, LINE_MAX_CHARS, LOG_MAX_CHARS, LOG_MAX_LINES } from "./log-buffer";
import { CRASH_MARKER, CURRENT_LOG, PREVIOUS_LOG, type DiagnosticFiles } from "./diagnostic-files";

export interface CrashMarker {
  message: string;
  stack: string;
  occurredAt: string;
  appVersion: string;
}

const STACK_MAX = 20_000;
const FLUSH_DELAY_MS = 3000;
// Dev builds log far more and flush less often; every flush is a synchronous file write.
const DEV_FLUSH_DELAY_MS = 10_000;
// Records in one flush window that count as a burst, and the longest the flush then backs off to.
const BURST_RECORDS = 50;
const MAX_FLUSH_DELAY_MS = 30_000;

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
  const baseFlushDelayMs = typeof __DEV__ !== "undefined" && __DEV__ ? DEV_FLUSH_DELAY_MS : FLUSH_DELAY_MS;
  let flushDelayMs = baseFlushDelayMs;
  let timer: unknown = null;
  let disposed = false;
  // Set when the buffer changed since the last successful write, so idle flushes skip the write.
  let dirty = false;
  // The file still holds the previous run (or the last append failed), so the next flush rewrites it whole.
  let needsRewrite = true;
  // Lines kept in the ring since the last flush; appended instead of rewriting the whole file.
  let pending: string[] = [];
  let fileHasContent = false;
  let fileLines = 0;
  let fileChars = 0;
  let recordsSinceFlush = 0;

  const store = (line: string) => {
    const kept = buffer.push(line);
    pending.push(kept);
    dirty = true;
  };

  const pendingChars = () => pending.reduce((sum, line) => sum + line.length + 1, 0);
  const writeFile = () => {
    const full = needsRewrite || fileLines + pending.length > LOG_MAX_LINES || fileChars + pendingChars() > LOG_MAX_CHARS;
    if (full) {
      const text = buffer.text();
      files.write(CURRENT_LOG, text);
      needsRewrite = false;
      fileHasContent = text.length > 0;
      fileLines = buffer.size();
      fileChars = text.length;
    } else {
      const text = (fileHasContent ? "\n" : "") + pending.join("\n");
      try {
        files.append(CURRENT_LOG, text);
      } catch (error) {
        // An append may have been partial: the next flush rewrites the file from the ring.
        needsRewrite = true;
        throw error;
      }
      fileHasContent = true;
      fileLines += pending.length;
      fileChars += text.length;
    }
    pending = [];
  };

  const flush = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    settleRepeats();
    // A burst of records backs the periodic flush off; a quiet window returns it to the base delay.
    flushDelayMs = recordsSinceFlush >= BURST_RECORDS ? Math.min(flushDelayMs * 2, MAX_FLUSH_DELAY_MS) : baseFlushDelayMs;
    recordsSinceFlush = 0;
    if (!dirty) return;
    dirty = false;
    try {
      writeFile();
    } catch {
      // Logging must never throw into the app; keep the buffer dirty so the next flush retries.
      dirty = true;
    }
  };
  // Identical consecutive events collapse into one line plus "repeated N times".
  let last: { key: string; level: DiagnosticLogLevel; category: string; repeats: number } | null = null;
  const settleRepeats = () => {
    if (last && last.repeats > 0) {
      store(formatDiagnosticLine(now(), last.level, last.category, `previous event repeated ${last.repeats} times`));
    }
    if (last) last.repeats = 0;
  };
  const record = (level: DiagnosticLogLevel, category: string, message: string, fields: DiagnosticLogFields = {}) => {
    // The ring keeps at most LINE_MAX_CHARS of a line, so the text past that never reaches the log:
    // clip before building the dedupe key and the line instead of walking a huge message twice.
    const clipped = message.length > LINE_MAX_CHARS ? message.slice(0, LINE_MAX_CHARS) : message;
    const key = JSON.stringify([level, category, clipped, fields]);
    if (last && last.key === key) last.repeats += 1;
    else {
      settleRepeats();
      last = { key, level, category, repeats: 0 };
      store(formatDiagnosticLine(now(), level, category, clipped, fields));
    }
    recordsSinceFlush += 1;
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
