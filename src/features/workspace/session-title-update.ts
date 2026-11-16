import { captureSessionAuthority, type SessionAuthority } from "@/domain/session-authority";

export function sessionTitleUpdate(projectId: string, sessionId: string, title: string, reviewed: SessionAuthority) {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("This field is required.");
  return { projectId, sessionId, title: trimmed, ...captureSessionAuthority(reviewed) };
}
