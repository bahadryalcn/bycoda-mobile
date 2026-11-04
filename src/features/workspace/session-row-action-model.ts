import type { HostSession, HostSessionSummary } from "./wire";
import { captureSessionAuthority } from "@/domain/session-authority";

export type SessionRowReview = Readonly<{
  machineId: string;
  projectId: string;
  sessionId: string;
  revision: number;
  authorityGeneration?: number;
  archived: boolean;
  status: HostSessionSummary["status"];
  title: string;
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
    review.title === session.title
  );
}

/** Preserve the displayed authority; a fresh read can reject it, never silently upgrade it. */
export async function performSessionRowAction(
  action: "archive" | "delete",
  review: SessionRowReview,
  ports: {
    assertCurrent(): void;
    read(): Promise<HostSession>;
    write(params: Record<string, unknown>): Promise<unknown>;
  },
) {
  ports.assertCurrent();
  const current = await ports.read();
  ports.assertCurrent();
  if (
    current.projectId !== review.projectId ||
    current.session.id !== review.sessionId ||
    current.authorityGeneration !== review.authorityGeneration ||
    current.revision !== review.revision ||
    !!current.archived !== review.archived ||
    current.status !== review.status ||
    current.session.title !== review.title
  )
    throw new Error("This session changed. Refresh the list and review it again.");
  if (action === "delete" && current.status === "running")
    throw new Error("Stop the running session before deleting it.");
  return ports.write({
    projectId: review.projectId,
    sessionId: review.sessionId,
    ...captureSessionAuthority(review),
    ...(action === "archive" ? { archived: !review.archived } : {}),
  });
}
