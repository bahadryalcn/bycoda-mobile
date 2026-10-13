import { Field, FormActions, MutationState } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useCopy } from "@/ui/copy";
import { useFormDraft } from "@/state/form-draft";
import type { ReplanEditorProps } from "./types";

export function ReplanEditor({ goalId, replan, busy, onClose }: ReplanEditorProps) {
  const copy = useCopy();
  const form = useFormDraft({ feedback: "" });
  const { feedback } = form.values;
  const { requestClose } = useSheetGuard({ dirty: form.dirty, pending: busy, onClose });
  return (
    <>
      <Field
        editable={!busy}
        label={copy("Planda ne değişmeli?", "What should change in the plan?")}
        value={feedback}
        onChangeText={(value) => form.setField("feedback", value)}
        multiline
      />
      <MutationState mutation={replan} />
      <FormActions
        submitLabel={copy("Yeniden planla", "Replan")}
        busy={replan.isPending}
        disabled={!feedback.trim() || busy}
        onSubmit={() => replan.mutate({ goalId: goalId, feedback }, { onSuccess: () => onClose() })}
        cancelDisabled={busy}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
      />
    </>
  );
}
