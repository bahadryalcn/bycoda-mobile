import type {
  AssistantJob,
  AssistantJobHoldReason,
  AssistantJobStatus,
} from "../../../../src/shared/model/host-contracts/assistant";
import type { AssistantHistoryAccess } from "./assistant-history";
import type { AssistantJobAction } from "./assistant-client";

type Copy = [tr: string, en: string];
const STATUS: Record<AssistantJobStatus, Copy> = {
  queued: ["Sırada", "Queued"],
  planning: ["Planlanıyor", "Planning"],
  running: ["Çalışıyor", "Running"],
  stalled: ["Takıldı", "Stalled"],
  waiting: ["Yanıt bekliyor", "Needs your input"],
  done: ["Tamamlandı", "Done"],
  failed: ["Başarısız", "Failed"],
  paused: ["Duraklatıldı", "Paused"],
  cancelled: ["Durduruldu", "Stopped"],
};
const HOLD: Record<AssistantJobHoldReason, Copy> = {
  report: ["Bekliyor: rapor modu", "Waiting: report mode"],
  hours: ["Bekliyor: çalışma saatleri dışında", "Waiting: outside work hours"],
  budget: ["Bekliyor: bütçe doldu", "Waiting: budget used up"],
  paused: ["Bekliyor: asistan duraklatıldı", "Waiting: assistant paused"],
  noExecution: ["Bekliyor: çalıştırma modeli yok", "Waiting: no execution model"],
  disabled: ["Bekliyor: asistan kapalı", "Waiting: assistant off"],
  limits: ["Bekliyor: model limitleri", "Waiting: model limits"],
  noModel: ["Bekliyor: kullanılabilir model yok", "Waiting: no usable model"],
  dependency: ["Bekliyor: önceki iş", "Waiting: earlier job"],
};
export const jobStatusCopy = (status: AssistantJobStatus): Copy => STATUS[status];
export const jobHoldCopy = (reason: AssistantJobHoldReason): Copy => HOLD[reason];

const ENDED: readonly AssistantJobStatus[] = ["done", "cancelled"];
/** Jobs still worth the owner's attention: everything running, waiting or failed. */
export const jobNeedsAttention = (job: AssistantJob) => !ENDED.includes(job.status);
/** Host-owned reason a not-yet-started job waits; absent once it started. */
export function jobHold(
  job: AssistantJob,
  holds: Record<string, AssistantJobHoldReason> | undefined,
): AssistantJobHoldReason | undefined {
  return job.status === "queued" || job.status === "waiting" ? holds?.[job.id] : undefined;
}
export function jobActions(job: AssistantJob): AssistantJobAction[] {
  if (job.pendingTaskDeletion) return [];
  switch (job.status) {
    case "paused":
      return ["resume", "stop"];
    case "queued":
    case "planning":
    case "running":
    case "stalled":
    case "waiting":
      return ["pause", "stop"];
    default:
      return [];
  }
}
export function jobVisible(job: AssistantJob, access: AssistantHistoryAccess): boolean {
  const ids = job.projectIds?.length ? job.projectIds : job.projectId ? [job.projectId] : [];
  return ids.length === 0 || (access.ready && ids.every((id) => access.visible(id)));
}
