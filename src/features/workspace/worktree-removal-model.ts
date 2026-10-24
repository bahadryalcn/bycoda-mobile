export type WorktreeRemovalSnapshot = {
  reviewId: string; expiresAt: number; projectCwd: string; path: string; branch: string | null;
  head: string; dirty: boolean; unpushed: number; sessionIds: string[]; activeSessionIds: string[];
  hasTerminals: boolean; hasAgents: boolean; hasOpenFiles: boolean; canRemove: boolean;
  reasons: string[]; effects: { detachSessionIds: string[]; rebindProjectCwd: string }; atomic: false;
};
export type WorktreeRemovalStatus = { state: "pending" | "applied" | "failed" | "unknown"; path?: string; message?: string };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 4096): value is string => typeof value === "string" && !!value && value.length <= max && !/[\0\r\n]/.test(value);
const list = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 500 && value.every((row) => text(row)) && new Set(value).size === value.length;
export function readWorktreeRemoval(value: unknown, path: string): WorktreeRemovalSnapshot {
  if (!record(value) || Object.keys(value).some((key) => !["reviewId", "expiresAt", "projectCwd", "path", "branch", "head", "dirty", "unpushed", "sessionIds", "activeSessionIds", "hasTerminals", "hasAgents", "hasOpenFiles", "canRemove", "reasons", "effects", "atomic"].includes(key)) ||
    !text(value.reviewId, 200) || !Number.isSafeInteger(value.expiresAt) || value.path !== path || !text(value.path) || !text(value.projectCwd) ||
    !(value.branch === null || text(value.branch)) || !text(value.head, 200) || typeof value.dirty !== "boolean" || !Number.isSafeInteger(value.unpushed) || (value.unpushed as number) < 0 ||
    !list(value.sessionIds) || !list(value.activeSessionIds) || !Array.isArray(value.reasons) || value.reasons.length > 10 || !value.reasons.every((row) => text(row)) ||
    ![value.hasTerminals, value.hasAgents, value.hasOpenFiles, value.canRemove].every((row) => typeof row === "boolean") || value.atomic !== false ||
    !record(value.effects) || Object.keys(value.effects).some((key) => !["detachSessionIds", "rebindProjectCwd"].includes(key)) || !list(value.effects.detachSessionIds) || !text(value.effects.rebindProjectCwd) ||
    JSON.stringify(value.sessionIds) !== JSON.stringify(value.effects.detachSessionIds) || value.effects.rebindProjectCwd !== value.projectCwd ||
    (value.canRemove && (value.dirty || value.unpushed !== 0 || value.hasTerminals || value.hasAgents || value.hasOpenFiles || value.activeSessionIds.length || value.reasons.length))) throw new Error("Invalid worktree removal review");
  return value as WorktreeRemovalSnapshot;
}
export function readWorktreeRemovalStatus(value: unknown): WorktreeRemovalStatus {
  if (!record(value) || Object.keys(value).some((key) => !["state", "path", "message"].includes(key)) || !["pending", "applied", "failed", "unknown"].includes(String(value.state)) || (value.path !== undefined && !text(value.path)) || (value.message !== undefined && !text(value.message))) throw new Error("Invalid worktree removal receipt");
  return value as WorktreeRemovalStatus;
}
