import { useRef } from "react";
import { useConnectionScope } from "@/state/connection-scope";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { showToast } from "@/ui/toast";

type RecordRevision = { id: string; title: string; status: string; updatedAt: number };

/** Binds a native confirmation to the record and computer shown when it opened. */
export function useRecordConfirmation(record: RecordRevision, machineName: string | undefined, busy: boolean) {
  const connection = useConnectionScope();
  const copy = useCopy();
  const activeReview = useRef<symbol | undefined>(undefined);
  const latest = useRef({ record, busy });
  latest.current = { record, busy };

  return (title: string, consequence: string, label: string, action: () => void, intent?: "default" | "destructive") => {
    const token = Symbol();
    activeReview.current = token;
    const subject = machineName ? `${record.title} · ${machineName}` : record.title;
    confirmAction(title, `${subject}\n\n${consequence}`, label, () => {
      if (activeReview.current !== token) return;
      activeReview.current = undefined;
      const current = latest.current;
      if (!connection.isCurrent() || current.busy || current.record.id !== record.id ||
        current.record.title !== record.title || current.record.status !== record.status ||
        current.record.updatedAt !== record.updatedAt) {
        showToast({ tone: "warning", message: copy("İncelenen içerik değişti. Yenileyip tekrar inceleyin.", "Reviewed contents changed. Refresh and review again.") });
        return;
      }
      action();
    }, undefined, intent);
  };
}
