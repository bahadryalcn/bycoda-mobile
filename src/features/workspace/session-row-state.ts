import type { HostSessionSummary } from "@/domain/types";
import type { SessionSummary } from "../../../../src/features/sessions/data/sessionStore";
import { sessionStatusOrder } from "../../../../src/features/sessions/model/sessionStatusOrder";

export type SessionRowKind =
  | "failed"
  | "retrying"
  | "interrupted"
  | "input"
  | "working"
  | "waiting"
  | "done"
  | "idle";

type RowSession = Pick<HostSessionSummary, "issue" | "status" | "needsInput" | "waiting">;

/**
 * Desktop row status over the wire summary: retrying/failed > interrupted > needs input >
 * working > waiting > unseen done > idle. `done` is the client's unseen-finished signal.
 * A failure label never hides current running or input state (the Host derives the issue
 * against the run, but a stale summary must not mask live work).
 */
export function sessionRowKind(session: RowSession, done = false): SessionRowKind {
  if (session.issue === "retrying") return "retrying";
  if (session.issue === "failed" && session.status !== "running" && !session.needsInput) return "failed";
  if (session.status === "interrupted" && !session.needsInput) return "interrupted";
  if (session.needsInput) return "input";
  if (session.waiting) return "waiting";
  if (session.status === "running") return "working";
  return done ? "done" : "idle";
}

export type SessionOrderSignals = {
  /** Sessions that finished while the owner was elsewhere. */
  doneIds?: ReadonlySet<string>;
  /** Failures and drafts older than the desktop lift window keep their recency place. */
  now?: number;
};

/** Desktop `sessionStatusOrder` over wire summaries; equal ranks keep the caller's order. */
export function sessionStatusComparator(
  sessions: readonly HostSessionSummary[],
  { doneIds, now }: SessionOrderSignals = {},
): (a: HostSessionSummary, b: HostSessionSummary) => number {
  const inputIds = new Set<string>();
  const workingIds = new Set<string>();
  const waitingIds = new Set<string>();
  const desktop = new Map<string, SessionSummary>();
  for (const session of sessions) {
    if (session.needsInput) inputIds.add(session.id);
    if (session.waiting) waitingIds.add(session.id);
    else if (session.status === "running") workingIds.add(session.id);
    desktop.set(session.id, {
      ...session,
      interrupted: session.status === "interrupted",
    } as unknown as SessionSummary);
  }
  const compare = sessionStatusOrder(inputIds, workingIds, { doneIds, waitingIds, now });
  return (a, b) => compare(desktop.get(a.id)!, desktop.get(b.id)!);
}

type OrderedRow = {
  kind: string;
  session?: HostSessionSummary;
  depth?: number;
  ancestors?: readonly string[];
};

/**
 * Stable-sorts each run of sibling session rows (same depth and folder path; folder and header
 * rows end a run) by the desktop status rank, so each group leads with actionable work.
 */
export function orderSessionRuns<Row extends OrderedRow>(
  rows: readonly Row[],
  signals: SessionOrderSignals = {},
): Row[] {
  const compare = sessionStatusComparator(
    rows.flatMap((row) => (row.kind === "session" && row.session ? [row.session] : [])),
    signals,
  );
  const sibling = (row: Row) =>
    row.kind === "session" && row.session
      ? `${row.depth ?? 0}\0${(row.ancestors ?? []).join("\0")}`
      : undefined;
  const result: Row[] = [];
  for (let start = 0; start < rows.length; ) {
    const key = sibling(rows[start]!);
    let end = start + 1;
    if (key !== undefined) while (end < rows.length && sibling(rows[end]!) === key) end += 1;
    const run = rows.slice(start, end);
    if (run.length > 1) run.sort((a, b) => compare(a.session!, b.session!));
    result.push(...run);
    start = end;
  }
  return result;
}
