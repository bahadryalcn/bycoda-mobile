import { Body, Field, FormActions, MutationState } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useCopy } from "@/ui/copy";
import { useFormDraft } from "@/state/form-draft";
import { useHostMutation } from "@/state/queries";
import type { HostTask } from "@/domain/types";

export function DeliveryEditor({ task, onClose }: { task: HostTask; onClose: () => void }) {
  const copy = useCopy();
  const form = useFormDraft({ checkoutCwd: task.deliveryCwd ?? "", baseBranch: task.baseBranch ?? "" });
  const save = useHostMutation<HostTask>("tasks.retarget", ["tasks"]);
  const { requestClose } = useSheetGuard({ dirty: form.dirty, pending: save.isPending, onClose });
  return <>
    <Body muted>{copy("İncelenmiş çalışma korunur. Hedefi kaydetmek görevi yeniden başlatmaz veya birleştirmez.", "Reviewed work is retained. Saving a target does not restart or merge the task.")}</Body>
    <Field label={copy("Hedef klasör", "Target checkout")} value={form.values.checkoutCwd} editable={!save.isPending} autoCapitalize="none" autoCorrect={false} onChangeText={(value) => form.setField("checkoutCwd", value)} />
    <Field label={copy("Hedef dal", "Target branch")} value={form.values.baseBranch} editable={!save.isPending} autoCapitalize="none" autoCorrect={false} onChangeText={(value) => form.setField("baseBranch", value)} />
    <FormActions
      feedback={<MutationState mutation={save} />} submitLabel={copy("Hedefi kaydet", "Save target")} busy={save.isPending} disabled={!form.dirty || !form.values.checkoutCwd.trim() || !form.values.baseBranch.trim()} onSubmit={() => save.mutate({ taskId: task.id, workspace: form.values, autoMerge: false }, { onSuccess: onClose })} cancelLabel={copy("Vazgeç", "Cancel")} cancelDisabled={save.isPending} onCancel={requestClose} />
  </>;
}
