/** The conversation on screen; its own pushes do not show a banner. */
let viewing: { environmentId: string; sessionId: string } | null = null;
export function setViewingSession(value: typeof viewing) {
  viewing = value;
}
export function isViewingSession(data: unknown): boolean {
  if (!viewing || !data || typeof data !== "object") return false;
  const { environmentId, sessionId } = data as Record<string, unknown>;
  return environmentId === viewing.environmentId && sessionId === viewing.sessionId;
}
