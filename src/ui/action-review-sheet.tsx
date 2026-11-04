import type { PropsWithChildren, ReactNode } from "react";
import { FormActions, Sheet } from "./dialogs";
import { useCopy } from "./copy";
import type { FormActionsProps } from "./component-props";

/** Shared preflight composition; callers own frozen targets, permission and delivery. */
export function ActionReviewSheet({ title, submitLabel, onConfirm, onClose, scroll = true, tone, disabled, busy, feedback, children }: PropsWithChildren<{
  title: string;
  submitLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  scroll?: boolean;
  tone?: FormActionsProps["tone"];
  disabled?: boolean;
  busy?: boolean;
  feedback?: ReactNode;
}>) {
  const copy = useCopy();
  return <Sheet visible size="form" title={title} onClose={onClose} scroll={scroll} dismissible={!busy}>
    {children}
    <FormActions submitLabel={submitLabel} tone={tone} disabled={disabled} busy={busy} feedback={feedback} cancelDisabled={busy} cancelLabel={copy("Vazgeç", "Cancel")} onCancel={onClose} onSubmit={onConfirm} />
  </Sheet>;
}
