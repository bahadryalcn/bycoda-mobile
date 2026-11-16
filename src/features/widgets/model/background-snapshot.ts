import { buildWidgetSnapshot, type WidgetSnapshot, type WidgetSessionInput } from "./snapshot";

export const WIDGET_CACHE_KEY = "bycoda.mobile.widget-cache.v1";
export interface WidgetCache {
  environmentId: string;
  machineId: string;
  machineName: string;
  backgroundAllowed: boolean;
  locale?: string;
  showTitles: boolean;
  showQuestionText: boolean;
  snapshot: WidgetSnapshot;
  /** Privacy-filtered directory; text already passed through snapshot.ts. */
  sessions: WidgetSessionInput[];
  projects?: { id: string; name: string }[];
  lastPushAt: number;
}

type Update = {
  v: 1;
  at: number;
  complete: boolean;
  sessions: {
    id: string;
    projectId: string;
    kind: "running" | "question" | "failed" | "done";
    status: WidgetSessionInput["status"];
    updatedAt: number;
  }[];
};

export function parseWidgetUpdate(data: unknown): { environmentId: string; update: Update } | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (
    record.kind !== "widget" ||
    typeof record.environmentId !== "string" ||
    typeof record.widget !== "string" ||
    record.widget.length > 3500
  )
    return null;
  try {
    const update = JSON.parse(record.widget) as Update;
    if (
      update.v !== 1 ||
      !Number.isFinite(update.at) ||
      typeof update.complete !== "boolean" ||
      !Array.isArray(update.sessions) ||
      update.sessions.length > 10
    )
      return null;
    const ids = new Set<string>();
    for (const row of update.sessions) {
      if (
        !row ||
        typeof row.projectId !== "string" ||
        !row.projectId ||
        row.projectId.length > 100 ||
        typeof row.id !== "string" ||
        !row.id ||
        row.id.length > 100 ||
        ids.has(row.id) ||
        !["running", "question", "failed", "done"].includes(row.kind) ||
        !["running", "idle", "interrupted"].includes(row.status) ||
        !Number.isFinite(row.updatedAt) ||
        row.updatedAt < 0 ||
        (row.kind === "running" && row.status !== "running") ||
        (row.kind === "done" && row.status !== "idle")
      )
        return null;
      ids.add(row.id);
    }
    return { environmentId: record.environmentId, update };
  } catch {
    return null;
  }
}

/** Never import text from push or merge computers; new rows require a locally known project. */
export function mergeWidgetUpdate(
  cache: WidgetCache,
  data: unknown,
  now: number,
): WidgetCache | null {
  const parsed = parseWidgetUpdate(data);
  if (
    !parsed ||
    parsed.environmentId !== cache.environmentId ||
    parsed.update.at <= cache.lastPushAt ||
    parsed.update.at > now + 60_000 ||
    now - parsed.update.at > 10 * 60_000
  )
    return null;
  const { update } = parsed;
  const byId = new Map(update.sessions.map((row) => [row.id, row]));
  const sessions = cache.sessions.flatMap((session) => {
    const row = byId.get(session.id);
    if (!row)
      return update.complete
        ? [
            {
              ...session,
              status: "idle" as const,
              needsInput: false,
              issue: undefined,
              questionPrompt: undefined,
              startedAt: undefined,
              completedAt: undefined,
            },
          ]
        : [session];
    if (row.projectId !== session.projectId) return [];
    if (row.updatedAt < session.updatedAt) return [session];
    return [
      {
        ...session,
        status: row.status,
        needsInput: row.kind === "question",
        issue: row.kind === "failed" ? ("failed" as const) : undefined,
        // A new question/failure cannot reuse the previous occurrence's locally cached detail.
        questionPrompt: row.updatedAt === session.updatedAt ? session.questionPrompt : undefined,
        failureCategory:
          row.updatedAt === session.updatedAt
            ? session.failureCategory
            : row.status === "interrupted"
              ? ("stopped" as const)
              : ("failed" as const),
        completedAt:
          row.kind === "done" && row.updatedAt === session.updatedAt
            ? session.completedAt
            : undefined,
        startedAt:
          session.status === "running" && row.status === "running" ? session.startedAt : undefined,
        updatedAt: row.updatedAt,
      },
    ];
  });
  const projects = new Map(
    (
      cache.projects ??
      cache.sessions.map((session) => ({ id: session.projectId, name: session.projectName }))
    ).map((project) => [project.id, project.name]),
  );
  const known = new Set(cache.sessions.map((session) => session.id));
  for (const row of update.sessions) {
    if (known.has(row.id) || !projects.has(row.projectId)) continue;
    sessions.push({
      id: row.id,
      projectId: row.projectId,
      projectName: projects.get(row.projectId)!,
      title: "",
      status: row.status,
      needsInput: row.kind === "question",
      issue: row.kind === "failed" ? "failed" : undefined,
      updatedAt: row.updatedAt,
    });
  }
  const snapshot = buildWidgetSnapshot({
    machine: { id: cache.machineId, name: cache.machineName },
    unlocked: cache.backgroundAllowed && cache.snapshot.state === "ready",
    ready: true,
    sessions,
    locale: cache.locale,
    showTitles: cache.showTitles,
    showQuestionText: cache.showQuestionText,
    now,
    labels: cache.snapshot.labels,
    palette: cache.snapshot.palette,
  })!;
  // Partial/unknown directories cannot claim fresh completeness. Retain explicit refresh feedback.
  if (
    snapshot.state === "ready" &&
    (!update.complete || update.sessions.some((row) => !projects.has(row.projectId)))
  )
    snapshot.stale = true;
  return { ...cache, sessions, snapshot, lastPushAt: update.at };
}
