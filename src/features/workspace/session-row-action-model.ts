import type { HostSession, HostSessionSummary } from "./wire";
import { captureSessionAuthority } from "@/domain/session-authority";
import { sessionTitleUpdate } from "./session-title-update";

export type SessionRowReview = Readonly<{
  machineId: string;
  projectId: string;
  sessionId: string;
  revision: number;
  authorityGeneration?: number;
  archived: boolean;
  status: HostSessionSummary["status"];
  title: string;
  runId?: string;
}>;
export function reviewSessionRow(
  machineId: string,
  projectId: string,
  session: HostSessionSummary,
): SessionRowReview {
  if (!machineId || !projectId || session.projectId !== projectId)
    throw new Error("The session project is no longer available.");
  return Object.freeze({
    machineId,
    projectId,
    sessionId: session.id,
    revision: session.revision,
    ...captureSessionAuthority(session),
    archived: !!session.archived,
    status: session.status,
    title: session.title,
    runId: session.runId,
  });
}
export function sessionRowReviewMatches(
  review: SessionRowReview,
  machineId: string,
  projectId: string,
  session: HostSessionSummary,
) {
  return (
    review.machineId === machineId &&
    review.projectId === projectId &&
    session.projectId === projectId &&
    review.sessionId === session.id &&
    review.revision === session.revision &&
    review.authorityGeneration === session.authorityGeneration &&
    review.archived === !!session.archived &&
    review.status === session.status &&
    review.runId === session.runId &&
    review.title === session.title
  );
}

/** Preserve the displayed authority; a fresh read can reject it, never silently upgrade it. */
export async function performSessionRowAction(
  action: "archive" | "delete" | "rename" | "stop",
  review: SessionRowReview,
  ports: {
    assertCurrent(): void;
    read(): Promise<HostSession>;
    write(params: Record<string, unknown>): Promise<unknown>;
  },
  title?: string,
) {
  ports.assertCurrent();
  const current = await ports.read();
  ports.assertCurrent();
  if (
    current.projectId !== review.projectId ||
    current.session.id !== review.sessionId ||
    current.authorityGeneration !== review.authorityGeneration ||
    (action !== "stop" && current.revision !== review.revision) ||
    (action !== "stop" && !!current.archived !== review.archived) ||
    current.status !== review.status ||
    current.runId !== review.runId ||
    (action !== "stop" && current.session.title !== review.title)
  )
    throw new Error("This session changed. Refresh the list and review it again.");
  if (action === "delete" && current.status === "running")
    throw new Error("Stop the running session before deleting it.");
  if (action === "rename")
    return ports.write(sessionTitleUpdate(review.projectId, review.sessionId, title ?? "", review));
  if (action === "stop") {
    if (current.status !== "running" || !review.runId) throw new Error("This session is no longer running.");
    return ports.write({ type: "cancel", sessionId: review.sessionId, runId: review.runId, ...captureSessionAuthority(review) });
  }
  return ports.write({
    projectId: review.projectId,
    sessionId: review.sessionId,
    ...captureSessionAuthority(review),
    ...(action === "archive" ? { archived: !review.archived } : {}),
  });
}

export function sessionActionState(session: Pick<HostSessionSummary, "status" | "archived" | "pinned" | "runId">, settled: boolean) {
  return {
    pin: session.pinned ? "unpin" : "pin",
    archive: session.archived ? "unarchive" : "archive",
    settle: settled ? "unsettle" : "settle",
    canSettle: settled || session.status !== "running",
    canDelete: session.status !== "running",
    canStop: session.status === "running" && !!session.runId,
  } as const;
}

/** The open session's snapshot as the summary row the shared session actions review. */
export function sessionSummaryFromSnapshot(snapshot: HostSession): HostSessionSummary {
  const { session, blockRevisions: _blocks, desktop: _desktop, ...rest } = snapshot as HostSession & { desktop?: unknown };
  return {
    ...rest,
    id: session.id,
    title: session.title,
    harness: session.harness as HostSessionSummary["harness"],
    model: session.model,
    cwd: session.cwd,
    runtimeMode: session.runtimeMode,
    providerSessionId: session.providerSessionId,
    branch: session.branch,
    workspaceId: session.workspaceId,
    workspaceRevision: session.workspaceRevision,
    worktreeCwd: session.worktreeCwd,
  };
}
