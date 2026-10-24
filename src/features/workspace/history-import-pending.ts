import { reviewedOperationStore, type ReviewedOperationStorage } from "@/state/reviewed-operation-store";
export function historyPendingStore(storage: ReviewedOperationStorage, key: string) {
  return reviewedOperationStore(storage, key, "Invalid saved history receipt");
}
