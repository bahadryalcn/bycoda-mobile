import type { TaskBulkResult } from "../../../../../src/features/tasks/model/taskBulkActions";

/** Translate only local eligibility explanations; retain original Host failures. */
export function taskBulkReason(result: Pick<TaskBulkResult, "status" | "reason">, copy: (tr: string, en: string) => string): string | undefined {
  if (result.status !== "skipped") return result.reason;
  switch (result.reason) {
    case "Reconnect this machine before changing its tasks.":
      return copy("Bu bilgisayardaki görevleri değiştirmeden önce yeniden bağlanın.", "Reconnect this machine before changing its tasks.");
    case "Manage this assignment from its crew.":
      return copy("Bu görevlendirmeyi ekibinden yönetin.", "Manage this assignment from its crew.");
    case "Stop active work before deleting this task.":
      return copy("Bu görevi silmeden önce çalışan işi durdurun.", "Stop active work before deleting this task.");
    case "Unmerged work is protected. Review or discard it individually.":
      return copy("Birleştirilmemiş çalışma korunur. Tek tek inceleyin veya değişikliklerden vazgeçin.", "Unmerged work is protected. Review or discard it individually.");
    case "This task is not running.":
      return copy("Bu görev şu anda çalışmıyor.", "This task is not running.");
    case "Only tasks in To do can be started.":
      return copy("Yalnızca Yapılacak durumundaki görevler başlatılabilir.", "Only tasks in To do can be started.");
    case "Only blocked tasks can be retried.":
      return copy("Yalnızca Engellendi durumundaki görevler yeniden denenebilir.", "Only blocked tasks can be retried.");
    case "Update this task's instructions before starting it.":
      return copy("Başlatmadan önce bu görevin talimatlarını güncelleyin.", "Update this task's instructions before starting it.");
    default:
      return result.reason;
  }
}
