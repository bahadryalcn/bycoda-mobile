import { useRef, useState } from "react";
import { useMachines } from "@/state/machines";
import { isReviewedMachine } from "@/state/reviewed-machine";
import { sameFormValue, useFormDraft } from "@/state/form-draft";
import { useCopy } from "@/ui/copy";
import { useConnectionScope } from "./connection-scope";

/** An editor keeps its opening authority and draft when its workspace disappears. */
export function useSocialEditorAccess(available: boolean) {
  const scope = useConnectionScope();
  const [opening] = useState(scope);
  const currentAccess = useRef(available);
  currentAccess.current = available;
  const copy = useCopy();
  const message = copy("Bilgisayar bağlantısı değişti. Doğru bilgisayarı seçip bu görünümü yeniden açın.", "The computer connection changed. Select the correct computer and reopen this view.");
  const isCurrent = () => currentAccess.current && opening.isCurrent() && isReviewedMachine(opening.review, useMachines.getState());
  return { key: scope.token, blocked: !isCurrent(), message, isCurrent,
    assert: () => { if (!isCurrent()) throw new Error(message); } };
}

/** Blocked editors show their own reviewed context, never a replacement computer's. */
export function useSocialEditorContext<T>(value: T, blocked: boolean): T {
  const retained = useRef(value);
  if (!blocked) retained.current = value;
  return retained.current;
}

/** Keep the existing form owner; observe late input before a success may close it. */
export function useSocialEditorForm<T extends object>(initial: T) {
  const form = useFormDraft(initial);
  const latest = useRef(form.values);
  latest.current = form.values;
  return { ...form, latest,
    setField: <K extends keyof T>(key: K, value: T[K]) => {
      latest.current = { ...latest.current, [key]: value };
      form.setField(key, value);
    },
    complete: (submitted: T, close: () => void) => {
      form.markSaved(submitted);
      if (sameFormValue(latest.current, submitted)) close();
    },
  };
}
