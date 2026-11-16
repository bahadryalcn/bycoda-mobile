import { dateTimeFormat } from "../../../../../src/shared/lib/intl";
import { truncateGraphemes } from "../../../../../src/shared/lib/text/truncate";

/**
 * Pure widget snapshot model. The snapshot is the only data that leaves the app for
 * home-screen widgets and Live Activities, so everything privacy related happens here:
 * no paths, branches or tokens; titles and question text need separate owner opt-ins, and a
 * locked/setup state that carries no session data at all.
 */
export const WIDGET_SCHEME = "bycoda://";
export const SNAPSHOT_TTL_MS = 10 * 60_000;
export const MAX_WIDGET_SESSIONS = 5;
const TITLE_LIMIT = 60;
const PROJECT_LIMIT = 40;
/** Finished or failed sessions older than this are noise on a glanceable surface. */
const RECENT_MS = 12 * 60 * 60_000;

export type WidgetFailureCategory =
  | "auth_expired"
  | "rate_limited"
  | "crashed"
  | "stopped"
  | "failed";
export type WidgetSessionKind = "running" | "question" | "failed" | "done";
export type WidgetSessionStatus = "needs_input" | "failed" | "running" | "done";
export type WidgetState = "ready" | "locked" | "setup";

export interface WidgetPalette {
  background: string;
  foreground: string;
  secondary: string;
  track: string;
  accent: string;
  danger: string;
  warning: string;
  success: string;
  /** Row cards on top of the widget background. Optional so older cached snapshots still render. */
  surface?: string;
  accentSoft?: string;
  dangerSoft?: string;
  warningSoft?: string;
  successSoft?: string;
}

export interface WidgetLabels {
  title: string;
  running: string;
  needsInput: string;
  failed: string;
  done?: string;
  waitingAnswer?: string;
  failureCategories?: Record<WidgetFailureCategory, string>;
  started?: string;
  empty: string;
  /** Attention widget with nothing waiting or failed. */
  clear?: string;
  locked: string;
  setup: string;
  stale: string;
}

export interface WidgetSessionRow {
  id: string;
  title: string;
  project: string;
  status: WidgetSessionStatus;
  kind: WidgetSessionKind;
  detail: string;
  failureCategory?: WidgetFailureCategory;
  startedAt?: number;
  startedLabel?: string;
  updatedAt: number;
  url: string;
}

export interface WidgetSnapshot {
  v: 1;
  state: WidgetState;
  machineName: string;
  generatedAt: number;
  expiresAt: number;
  /** Set on the timeline entry the widget shows after `expiresAt`. */
  stale: boolean;
  counts: { running: number; needsInput: number; failed: number };
  sessions: WidgetSessionRow[];
  labels: WidgetLabels;
  /** Colors for Compose widgets, which cannot read the app theme. */
  palette: { light: WidgetPalette; dark: WidgetPalette };
  url: string;
}

/** Structural subset of a host session summary; nothing beyond these fields is ever read. */
export interface WidgetSessionInput {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  status: "idle" | "running" | "interrupted";
  needsInput?: boolean;
  questionPrompt?: string;
  completedAt?: number;
  startedAt?: number;
  failureCategory?: WidgetFailureCategory;
  draft?: boolean;
  issue?: "retrying" | "failed";
  archived?: boolean;
  /** Delegated child conversations are never shown on their own. */
  child?: boolean;
  updatedAt: number;
}

export interface BuildSnapshotInput {
  machine: { id: string; name: string } | null;
  unlocked: boolean;
  /** Directory loaded, privacy filtering settled and no access error. */
  ready: boolean;
  sessions: readonly WidgetSessionInput[];
  projects?: readonly { id: string; name: string }[];
  showTitles: boolean;
  showQuestionText?: boolean;
  locale?: string;
  now: number;
  labels: WidgetLabels;
  palette: WidgetSnapshot["palette"];
}

/** Local cache uses the same privacy gate, including idle titles needed by a later background start. */
export function widgetCacheContent(input: BuildSnapshotInput): {
  sessions: WidgetSessionInput[];
  projects: { id: string; name: string }[];
} {
  if (!input.machine || !input.unlocked || !input.ready) return { sessions: [], projects: [] };
  const sessions = input.sessions
    .filter((session) => !session.archived && !session.child && !session.draft)
    .map((session) => ({
      id: session.id,
      projectId: session.projectId,
      projectName: truncateLabel(session.projectName, PROJECT_LIMIT),
      title: input.showTitles ? truncateLabel(session.title, TITLE_LIMIT) : "",
      status: session.status,
      needsInput: session.needsInput === true,
      issue: session.issue,
      updatedAt: session.updatedAt,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      failureCategory: ["auth_expired", "rate_limited", "crashed", "stopped", "failed"].includes(
        session.failureCategory ?? "",
      )
        ? session.failureCategory
        : undefined,
      ...(input.showTitles && input.showQuestionText && session.needsInput && session.questionPrompt
        ? { questionPrompt: truncateLabel(session.questionPrompt, 100) }
        : {}),
    }));
  return {
    sessions,
    projects: (
      input.projects ??
      sessions.map((session) => ({ id: session.projectId, name: session.projectName }))
    ).map((project) => ({ id: project.id, name: truncateLabel(project.name, PROJECT_LIMIT) })),
  };
}

/** Native payload labels share the app's grapheme-safe truncation. */
export function truncateLabel(text: string, max: number): string {
  return truncateGraphemes(text.replace(/\s+/g, " ").trim(), max);
}

const enc = encodeURIComponent;

export function sessionsUrl(): string {
  return `${WIDGET_SCHEME}sessions`;
}

export function setupUrl(): string {
  return `${WIDGET_SCHEME}machines`;
}

/** Always carries the computer id so a tap never opens a session on the wrong computer. */
export function sessionUrl(machineId: string, projectId: string, sessionId: string): string {
  return `${WIDGET_SCHEME}session/${enc(sessionId)}?projectId=${enc(projectId)}&machineId=${enc(machineId)}`;
}

export function widgetStatus(session: WidgetSessionInput): WidgetSessionStatus {
  if (session.needsInput) return "needs_input";
  if (session.issue === "failed" || session.status === "interrupted") return "failed";
  if (session.status === "running") return "running";
  return "done";
}

const rank: Record<WidgetSessionStatus, number> = {
  needs_input: 0,
  failed: 1,
  running: 2,
  done: 3,
};

function emptySnapshot(input: BuildSnapshotInput, state: WidgetState): WidgetSnapshot {
  return {
    v: 1,
    state,
    machineName: "",
    generatedAt: input.now,
    expiresAt: input.now + SNAPSHOT_TTL_MS,
    stale: false,
    counts: { running: 0, needsInput: 0, failed: 0 },
    sessions: [],
    labels: input.labels,
    palette: input.palette,
    url: state === "setup" ? setupUrl() : sessionsUrl(),
  };
}

/**
 * Returns `null` while the directory is not trustworthy (loading, privacy pending or
 * unavailable): the previously published snapshot stays until it expires on its own.
 */
export function buildWidgetSnapshot(input: BuildSnapshotInput): WidgetSnapshot | null {
  if (!input.unlocked) return emptySnapshot(input, "locked");
  if (!input.machine) return emptySnapshot(input, "setup");
  if (!input.ready) return null;
  const machine = input.machine;
  const rows: WidgetSessionRow[] = [];
  const counts = { running: 0, needsInput: 0, failed: 0 };
  for (const session of input.sessions) {
    if (session.archived || session.child || session.draft) continue;
    const status = widgetStatus(session);
    if (status === "done" && !Number.isFinite(session.completedAt)) continue;
    const recent =
      input.now - (status === "done" ? session.completedAt! : session.updatedAt) <= RECENT_MS;
    if ((status === "done" || status === "failed") && !recent) continue;
    if (status === "needs_input") counts.needsInput += 1;
    else if (status === "failed") counts.failed += 1;
    else if (status === "running") counts.running += 1;
    const failureCategory: WidgetFailureCategory = [
      "auth_expired",
      "rate_limited",
      "crashed",
      "stopped",
      "failed",
    ].includes(session.failureCategory ?? "")
      ? session.failureCategory!
      : session.status === "interrupted"
        ? "stopped"
        : "failed";
    rows.push({
      id: session.id,
      title: input.showTitles ? truncateLabel(session.title, TITLE_LIMIT) : "",
      project: truncateLabel(session.projectName, PROJECT_LIMIT),
      status,
      kind: status === "needs_input" ? "question" : status,
      detail:
        status === "needs_input"
          ? input.showTitles && input.showQuestionText && session.questionPrompt
            ? truncateLabel(session.questionPrompt, 100)
            : (input.labels.waitingAnswer ?? input.labels.needsInput)
          : status === "failed"
            ? (input.labels.failureCategories?.[failureCategory] ?? input.labels.failed)
            : status === "running"
              ? input.labels.running
              : (input.labels.done ?? ""),
      ...(status === "failed" ? { failureCategory } : {}),
      ...(status === "running" &&
      Number.isFinite(session.startedAt) &&
      session.startedAt! <= input.now
        ? {
            startedAt: session.startedAt,
            startedLabel: `${input.labels.started ?? input.labels.running} ${dateTimeFormat(input.locale, { hour: "2-digit", minute: "2-digit" }).format(session.startedAt)}`,
          }
        : {}),
      updatedAt: session.updatedAt,
      url: sessionUrl(machine.id, session.projectId, session.id),
    });
  }
  rows.sort((a, b) => rank[a.status] - rank[b.status] || b.updatedAt - a.updatedAt);
  return {
    ...emptySnapshot(input, "ready"),
    machineName: truncateLabel(machine.name, PROJECT_LIMIT),
    counts,
    sessions: rows.slice(0, MAX_WIDGET_SESSIONS),
  };
}

/** Everything except timing; used to publish only when something visible changed. */
export function snapshotIdentity(snapshot: WidgetSnapshot): string {
  const { generatedAt: _generatedAt, expiresAt: _expiresAt, ...stable } = snapshot;
  return JSON.stringify(stable);
}

/** iOS timeline: the live entry now and a stale entry when the snapshot expires. */
export function widgetTimeline(snapshot: WidgetSnapshot): { date: Date; props: WidgetSnapshot }[] {
  return [
    { date: new Date(snapshot.generatedAt), props: snapshot },
    { date: new Date(snapshot.expiresAt), props: { ...snapshot, stale: true } },
  ];
}

export interface LiveActivityProps {
  title: string;
  running: number;
  needsInput: number;
  rows: { title: string; project: string; status: WidgetSessionStatus; detail: string }[];
  palette?: WidgetSnapshot["palette"];
  labels: Pick<WidgetLabels, "running" | "needsInput" | "stale">;
  updatedAt: number;
  url: string;
}

/** `null` when nothing is running or waiting, which ends the activity. */
export function liveActivityProps(snapshot: WidgetSnapshot): LiveActivityProps | null {
  if (snapshot.state !== "ready") return null;
  const { running, needsInput } = snapshot.counts;
  if (running + needsInput === 0) return null;
  const active = snapshot.sessions.filter(
    (row) => row.status === "running" || row.status === "needs_input",
  );
  return {
    title: snapshot.labels.title,
    palette: snapshot.palette,
    running,
    needsInput,
    rows: active
      .slice(0, 3)
      .map(({ title, project, status, detail }) => ({ title, project, status, detail })),
    labels: {
      running: snapshot.labels.running,
      needsInput: snapshot.labels.needsInput,
      stale: snapshot.labels.stale,
    },
    updatedAt: snapshot.generatedAt,
    url: active[0]?.url ?? snapshot.url,
  };
}
