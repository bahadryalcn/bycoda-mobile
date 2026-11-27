import type { TaskWaitCode } from "../../../../../src/shared/model/host-contracts/task-stop";

type Copy = (tr: string, en: string) => string;

/** A short owner-facing sentence for why a queued task has not started yet. */
export function taskWaitReason(code: TaskWaitCode, copy: Copy): string {
  switch (code) {
    case "model_quota":
      return copy("Model kapasitesi bekleniyor", "Waiting for model capacity");
    case "usage_limit":
      return copy("Kullanım sınırının yenilenmesi bekleniyor", "Waiting for the usage limit to reset");
    case "daily_limit":
      return copy("Günlük sınırın yenilenmesi bekleniyor", "Waiting for the daily limit to reset");
    case "crew_capacity":
      return copy("Boş bir ekip bekleniyor", "Waiting for a free crew");
    case "dependency":
      return copy("Başka bir görevin bitmesi bekleniyor", "Waiting for another task to finish");
    case "assistant_hold":
      return copy("Asistan bu görevi bekletiyor", "The assistant is holding this task");
    default:
      return copy("Bekliyor", "Waiting");
  }
}
