import { useLayoutEffect, useRef, useState } from "react";
import { useConnectionScope } from "@/state/connection-scope";
import { useCopy } from "@/ui/copy";
import type { SheetProps } from "@/ui/component-props";
import { Body, FormActions, Sheet, Stack } from "@/ui/primitives";
import { showToast } from "@/ui/toast";

type RecordRevision = { id: string; title: string; status: string; updatedAt: number };
type RecordReview = {
  epoch: string;
  title: string;
  subject: string;
  consequence: string;
  label: string;
  intent: "default" | "destructive";
  accept: () => void;
  cancel: () => void;
};

/** Binds a confirmation to the record and connection reviewed when it opened. */
export function useRecordConfirmation(record: RecordRevision, machineName: string | undefined, busy: boolean, accessDenied = false) {
  const connection = useConnectionScope();
  const copy = useCopy();
  const [review, setReview] = useState<RecordReview | null>(null);
  const activeReview = useRef<symbol | undefined>(undefined);
  const latest = useRef({ record, busy, accessDenied });
  latest.current = { record, busy, accessDenied };

  // Ignore callbacks retained after a row or its editor has been removed.
  useLayoutEffect(() => () => { activeReview.current = undefined; }, []);

  // A refused pairing retires the review even if access later recovers.
  useLayoutEffect(() => {
    if (!accessDenied) return;
    activeReview.current = undefined;
    setReview(null);
  }, [accessDenied]);

  const confirm = (title: string, consequence: string, label: string, action: () => void, intent: RecordReview["intent"] = "destructive") => {
    if (!connection.isCurrent() || latest.current.busy || latest.current.accessDenied) return;
    const token = Symbol();
    activeReview.current = token;
    const subject = machineName ? `${record.title} · ${machineName}` : record.title;
    const close = () => {
      if (activeReview.current !== token) return false;
      activeReview.current = undefined;
      setReview(null);
      return true;
    };
    setReview({
      epoch: connection.token, title, subject, consequence, label, intent, cancel: close,
      accept: () => {
        if (!close()) return;
        const current = latest.current;
        if (!connection.isCurrent() || current.busy || current.accessDenied || current.record.id !== record.id ||
          current.record.title !== record.title || current.record.status !== record.status ||
          current.record.updatedAt !== record.updatedAt) {
          showToast({ tone: "warning", message: copy("İncelenen içerik değişti. Yenileyip tekrar inceleyin.", "Reviewed contents changed. Refresh and review again.") });
          return;
        }
        action();
      },
    });
  };
  return { confirm, review: !accessDenied && review?.epoch === connection.token ? review : null };
}

export function RecordConfirmationSheet({ review, returnFocusRef }: {
  review: RecordReview | null;
  returnFocusRef?: SheetProps["returnFocusRef"];
}) {
  const copy = useCopy();
  if (!review) return null;
  return (
    <Sheet visible size="compact" title={review.title} onClose={review.cancel} returnFocusRef={returnFocusRef}>
      <Stack>
        <Body>{review.subject}</Body>
        <Body muted>{review.consequence}</Body>
      </Stack>
      <FormActions
        submitLabel={review.label}
        onSubmit={review.accept}
        tone={review.intent === "destructive" ? "danger" : "primary"}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={review.cancel}
      />
    </Sheet>
  );
}
