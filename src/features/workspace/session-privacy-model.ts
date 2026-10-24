export type SessionPrivacy = { canRead: boolean; visible: boolean; projectId?: string; reason?: "access" | "pending" | "hidden" | "mismatch" | "missing" };
export function sessionPrivacy(input: { readable: boolean; pending: boolean; projects?: readonly { id: string }[]; sessionId: string; routeProjectId?: string;
  cached?: { projectId: string; session: { id: string } } }): SessionPrivacy {
  if (!input.readable) return { canRead: false, visible: false, reason: "access" };
  if (input.pending || input.projects === undefined) return { canRead: false, visible: false, reason: "pending" };
  if (input.cached && (input.cached.session.id !== input.sessionId || input.routeProjectId && input.cached.projectId !== input.routeProjectId))
    return { canRead: false, visible: false, reason: "mismatch" };
  const projectId = input.routeProjectId ?? input.cached?.projectId;
  if (!projectId) return { canRead: false, visible: false, reason: "missing" };
  if (!input.projects.some((row) => row.id === projectId)) return { canRead: false, visible: false, reason: "hidden" };
  return { canRead: true, visible: !!input.cached, projectId };
}
