export type HistoryCandidate = {
  id: string;
  provider: "claude" | "codex";
  prompt: string;
  startedAt: number;
  lastAt: number;
  sizeBytes: number;
  resumable: boolean;
  kind: string;
  imported: boolean;
};
export type HistoryPreview = {
  reviewId: string;
  digest: string;
  expiresAt: number;
  environmentId: string;
  sourceSessionId: string;
  candidates: HistoryCandidate[];
  omitted: number;
};
export type HistoryStatus = {
  state: "unknown" | "running" | "complete" | "failed";
  progress?: { total: number; done: number; imported: number; skipped: number; failed: number };
  result?: {
    imported: number;
    skipped: number;
    failed: number;
    readOnly: number;
    truncated: number;
    cancelled: boolean;
  };
  message?: string;
};
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const count = (value: unknown, limit = 500) =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= limit;
export function readHistoryPreview(
  value: unknown,
  environmentId: string,
  sourceSessionId: string,
): HistoryPreview {
  if (
    !record(value) ||
    !keys(value, [
      "reviewId",
      "digest",
      "expiresAt",
      "environmentId",
      "sourceSessionId",
      "candidates",
      "omitted",
    ]) ||
    !id(value.reviewId) ||
    typeof value.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.digest) ||
    !count(value.expiresAt, 8640000000000000) ||
    value.environmentId !== environmentId ||
    value.sourceSessionId !== sourceSessionId ||
    !count(value.omitted, 10000000) ||
    !Array.isArray(value.candidates) ||
    value.candidates.length > 500 ||
    !value.candidates.every(
      (row) =>
        record(row) &&
        keys(row, [
          "id",
          "provider",
          "prompt",
          "startedAt",
          "lastAt",
          "sizeBytes",
          "resumable",
          "kind",
          "imported",
        ]) &&
        id(row.id) &&
        typeof row.provider === "string" && ["claude", "codex"].includes(row.provider) &&
        typeof row.prompt === "string" &&
        row.prompt.length <= 1000 &&
        !/[\0\r\n]/.test(row.prompt) &&
        count(row.startedAt, 8640000000000000) &&
        count(row.lastAt, 8640000000000000) &&
        count(row.sizeBytes, Number.MAX_SAFE_INTEGER) &&
        typeof row.resumable === "boolean" &&
        typeof row.kind === "string" && ["interactive", "exec", "subagent"].includes(row.kind) &&
        typeof row.imported === "boolean",
    ) ||
    new Set(value.candidates.map((row) => row.id)).size !== value.candidates.length
  )
    throw new Error("Invalid private history review");
  return value as HistoryPreview;
}
export function readHistoryStatus(value: unknown): HistoryStatus {
  if (
    !record(value) ||
    !keys(value, ["state", "progress", "result", "message"]) ||
    typeof value.state !== "string" || !["unknown", "running", "complete", "failed"].includes(value.state) ||
    (value.message !== undefined &&
      (typeof value.message !== "string" || value.message.length > 500))
  )
    throw new Error("Invalid history operation status");
  for (const name of ["progress", "result"]) {
    const row = value[name];
    if (row === undefined) continue;
    const allowed =
      name === "progress"
        ? ["total", "done", "imported", "skipped", "failed"]
        : ["imported", "skipped", "failed", "readOnly", "truncated", "cancelled"];
    if (
      !record(row) ||
      !keys(row, allowed) ||
      allowed.some((field) =>
        field === "cancelled" ? typeof row[field] !== "boolean" : !count(row[field]),
      )
    )
      throw new Error("Invalid history progress");
  }
  if (value.state === "complete" && !value.result) throw new Error("Missing history result");
  return value as HistoryStatus;
}
export function historySelection(
  preview: HistoryPreview,
  selected: ReadonlySet<string>,
  now = Date.now(),
) {
  if (
    preview.expiresAt <= now ||
    !selected.size ||
    [...selected].some((id) => !preview.candidates.some((row) => row.id === id && !row.imported))
  )
    throw new Error("Review a current history selection before importing");
  return { reviewId: preview.reviewId, digest: preview.digest, candidateIds: [...selected] };
}
