import { Body, Field, FormActions, MutationState, Stack } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useCopy } from "@/ui/copy";
import { useFormDraft } from "@/state/form-draft";
import { haptic } from "@/ui/motion";
import type { ReplanEditorProps } from "./types";

export function ReplanEditor({ goalId, replan, busy, onClose }: ReplanEditorProps) {
  const copy = useCopy();
  const form = useFormDraft({ feedback: "" });
  const { feedback } = form.values;
  const { requestClose } = useSheetGuard({ dirty: form.dirty, pending: busy, onClose });
  return (
    <Stack>
      <Field
        editable={!busy}
        label={copy("Planda ne değişmeli?", "What should change in the plan?")}
        hint={copy("Planlayıcı, yazdıklarınıza göre görev planını yeniden hazırlar. Çalışma onayınıza kadar başlamaz.", "The planner revises the task plan from your notes. Nothing runs until you approve it.")}
        value={feedback}
        onChangeText={(value) => form.setField("feedback", value)}
        multiline
      />
      <FormActions
        feedback={<><MutationState mutation={replan} /></>}
        submitLabel={copy("Yeniden planla", "Replan")}
        busy={replan.isPending}
        disabled={!feedback.trim() || busy}
        onSubmit={() => replan.mutate({ goalId: goalId, feedback }, { onSuccess: () => { haptic.success(); onClose(); } })}
        cancelDisabled={busy}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
      />
    </Stack>
  );
}
