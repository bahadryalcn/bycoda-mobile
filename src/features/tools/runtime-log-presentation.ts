import type { RuntimeLogEntry, RuntimeLogLevel, RuntimeLogSnapshot } from "./types";

export const LOG_SEARCH_LIMIT = 512;
export const LOG_DETAILS_LIMIT = 16_000;
/** Newest entries requested from the host and the most the list ever holds. */
export const LOG_ENTRY_LIMIT = 200;
export const LOG_POLL_ACTIVE_MS = 5_000;
export const LOG_POLL_IDLE_MS = 15_000;
/** Consecutive polls without a new entry before the poll slows down. */
export const LOG_POLL_IDLE_AFTER = 3;

const NO_ENTRIES: RuntimeLogEntry[] = [];

/**
 * Newest-first rows for one project, bounded to the entry limit. Entry objects are
 * passed through untouched so query structural sharing keeps unchanged rows identical.
 */
export function visibleLogEntries(entries: readonly RuntimeLogEntry[] | undefined, projectId: string) {
  if (!entries?.length) return NO_ENTRIES;
  const visible: RuntimeLogEntry[] = [];
  for (let index = entries.length - 1; index >= 0 && visible.length < LOG_ENTRY_LIMIT; index--) {
    if (entries[index]!.projectId === projectId) visible.push(entries[index]!);
  }
  return visible.length ? visible : NO_ENTRIES;
}

export type LogPollState = { signature: string; unchanged: number };
export const initialLogPollState: LogPollState = { signature: "", unchanged: 0 };

/** Advance after each completed read: count polls that brought nothing new, reset on any change. */
export function advanceLogPoll(
  state: LogPollState,
  snapshot: Pick<RuntimeLogSnapshot, "streamId" | "cursor" | "entries"> | undefined,
): LogPollState {
  if (!snapshot) return state === initialLogPollState ? state : initialLogPollState;
  const signature = [snapshot.streamId ?? "", snapshot.cursor, snapshot.entries.length, snapshot.entries.at(-1)?.id ?? ""].join("|");
  if (signature !== state.signature) return { signature, unchanged: 0 };
  return state.unchanged >= LOG_POLL_IDLE_AFTER ? state : { signature, unchanged: state.unchanged + 1 };
}

export const logPollInterval = (state: LogPollState) =>
  state.unchanged >= LOG_POLL_IDLE_AFTER ? LOG_POLL_IDLE_MS : LOG_POLL_ACTIVE_MS;

/**
 * The last `limit` UTF-16 units of a log, without splitting a surrogate pair at the cut. A plain
 * slice, so a 256 KB buffer is never segmented whole just to show its end.
 */
export function logTail(output: string, limit: number): { text: string; truncated: boolean } {
  if (output.length <= limit) return { text: output, truncated: false };
  let start = output.length - limit;
  const code = output.charCodeAt(start);
  if (code >= 0xdc00 && code <= 0xdfff) start += 1;
  return { text: output.slice(start), truncated: true };
}

export const logLevelTone = (level: RuntimeLogLevel) =>
  level === "error" ? "danger" : level === "warn" ? "warning" : "default";

/** Keep the entered draft intact; an invalid filter must not issue a different search. */
export function logSearch(value: string) {
  const query = value.trim();
  return { query, tooLong: query.length > LOG_SEARCH_LIMIT };
}

/** Joins only the parts that exist: a file alone stays `file`, never `file::` or `file:12:`. */
export function logLocation(location: { file: string; line?: number | null; column?: number | null }) {
  const parts = [location.file];
  if (location.line !== undefined && location.line !== null) parts.push(String(location.line));
  if (location.column !== undefined && location.column !== null) parts.push(String(location.column));
  return parts.join(":");
}

export function logDetails(value: unknown) {
  const serialized = JSON.stringify(value, null, 2) ?? "";
  return {
    text: serialized.slice(0, LOG_DETAILS_LIMIT),
    truncated: serialized.length > LOG_DETAILS_LIMIT,
  };
}
