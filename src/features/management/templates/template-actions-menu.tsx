import { useLayoutEffect, useMemo } from "react";
import { ActionMenu } from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";

/** One secondary/destructive pattern for phone and computer templates. */
export function TemplateActionsMenu({ templateId, name, revision, disabled, busy = false, isCurrent, onDelete }: {
  templateId: string;
  name: string;
  revision?: string;
  disabled: boolean;
  busy?: boolean;
  isCurrent?: () => boolean;
  onDelete: () => void;
}) {
  const copy = useCopy();
  const review = useMemo(() => ({ active: false }), [templateId, name, revision, disabled, busy]);
  useLayoutEffect(() => {
    review.active = true;
    return () => { review.active = false; };
  }, [review]);
  const available = () => review.active && !disabled && !busy && (isCurrent?.() ?? true);
  return <ActionMenu label={copy("{p0} işlemleri", "{p0} actions", { p0: name })} busy={busy}
    actions={[{
      key: "delete", label: copy("Şablonu sil", "Delete template"), destructive: true, reviewed: true, disabled: disabled || busy,
      onPress: () => {
        if (!available()) return;
        confirmAction(copy("Şablonu sil", "Delete template"), name, copy("Sil", "Delete"), () => {
          if (available()) onDelete();
        });
      },
    }]} />;
}
