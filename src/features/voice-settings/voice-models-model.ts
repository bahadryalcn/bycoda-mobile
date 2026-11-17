export type LocalVoiceModel = { id: string; label: string; installed: boolean; sizeBytes?: number };
export type ModelAction = "download" | "test" | "delete";
export type ModelJob = { state: "idle" | "working" | "ready" | "error"; id?: string; action?: ModelAction; detail?: string; bytesDone?: number; bytesTotal?: number };
export type ModelRowState = "downloading" | "testing" | "removing" | "installed" | "missing" | "failed";

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
/** Whole percent of a download, or undefined when the Host reports no total. */
export function downloadPercent(job: ModelJob): number | undefined {
  if (job.bytesTotal === undefined || job.bytesDone === undefined) return undefined;
  return Math.max(0, Math.min(100, Math.round((job.bytesDone / job.bytesTotal) * 100)));
}

/** Host replies are untrusted: keep only well-formed rows. */
export function parseLocalModels(value: unknown): LocalVoiceModel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = item as Partial<Record<string, unknown>> | null;
    return row && typeof row.id === "string" && typeof row.label === "string" ? [{ id: row.id, label: row.label, installed: row.installed === true, ...(positive(row.sizeBytes) ? { sizeBytes: row.sizeBytes } : {}) }] : [];
  });
}
export function parseModelJob(value: unknown): ModelJob {
  const job = (value && typeof value === "object" ? value : {}) as Partial<Record<string, unknown>>;
  const state = job.state === "working" || job.state === "ready" || job.state === "error" ? job.state : "idle";
  const action = job.action === "download" || job.action === "test" || job.action === "delete" ? job.action : undefined;
  return { state, ...(typeof job.id === "string" ? { id: job.id } : {}), ...(action ? { action } : {}), ...(typeof job.detail === "string" ? { detail: job.detail } : {}), ...(typeof job.bytesDone === "number" && Number.isFinite(job.bytesDone) && job.bytesDone >= 0 ? { bytesDone: job.bytesDone } : {}), ...(positive(job.bytesTotal) ? { bytesTotal: job.bytesTotal } : {}) };
}
export function modelRowState(model: LocalVoiceModel, job: ModelJob): ModelRowState {
  if (job.id === model.id) {
    if (job.state === "working") return job.action === "delete" ? "removing" : job.action === "test" ? "testing" : "downloading";
    if (job.state === "error") return "failed";
  }
  return model.installed ? "installed" : "missing";
}
/** Cloud dictation is offered once the Host holds an OpenRouter key. */
export function cloudAvailable(status: unknown): boolean {
  return (status as { openrouter?: unknown } | null)?.openrouter === true;
}
/** The Host runs one model action at a time. */
export const modelBusy = (job: ModelJob) => job.state === "working";
