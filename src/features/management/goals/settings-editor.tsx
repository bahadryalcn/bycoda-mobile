import { useState } from "react";
import type { HostGoal } from "@/domain/types";
import { useHostMutation } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { useFormDraft } from "@/state/form-draft";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { Body, Field, FormActions, MutationState, Notice, Stack, ToggleField } from "@/ui/primitives";
import { goalSettings, validGoalSettings } from "./settings-model";

export function GoalSettingsEditor({ initial, onClose }: { initial: HostGoal; onClose: () => void }) {
  const copy = useCopy();
  // Keep both the draft and conflict token from the opening record across polling.
  const [opening] = useState(initial);
  const form = useFormDraft(() => goalSettings(opening));
  const [concurrency, setConcurrency] = useState(String(opening.maxRunningTasks ?? 0));
  const [minutes, setMinutes] = useState(String(opening.maxRunMinutes));
  const machine = useActiveMachine();
  const [openingMachineId] = useState(machine?.id);
  const supported = machine?.id === openingMachineId && machine?.capabilities?.includes("goals.settings") === true;
  const save = useHostMutation<HostGoal>("goals.update", ["goals"]);
  const dirty = form.dirty || concurrency !== String(opening.maxRunningTasks ?? 0) || minutes !== String(opening.maxRunMinutes);
  const { requestClose } = useSheetGuard({ dirty, pending: save.isPending, onClose });
  const valid = validGoalSettings(opening, form.values, concurrency, minutes);
  const submit = () => {
    if (!supported || !valid || save.isPending) return;
    save.mutate({ goalId: opening.id, expectedUpdatedAt: opening.updatedAt,
      settings: { ...form.values, maxRunningTasks: Number(concurrency), maxRunMinutes: Number(minutes) } },
    { onSuccess: onClose });
  };
  return <Stack>
    <Body>{opening.title}</Body>
    {!supported && <Notice tone="warning" message={copy("Hedef ayarları için bilgisayardaki bycoda uygulamasını güncelleyin.", "Update bycoda on this computer to edit goal settings.")} />}
    <ToggleField label={copy("Tamamlanana kadar devam et", "Continue until done")} value={form.values.continueUntilDone}
      disabled={save.isPending || !supported} onChange={(continueUntilDone) => form.patch({ continueUntilDone })} />
    <ToggleField label={copy("Otomatik birleştir", "Auto merge")} value={form.values.autoMerge}
      disabled={save.isPending || !supported || opening.isolate === false} onChange={(autoMerge) => form.patch({ autoMerge })} />
    <Field label={copy("Eşzamanlı görev sınırı (0 = bilgisayar sınırı)", "Concurrent task limit (0 = computer limit)")}
      value={concurrency} onChangeText={setConcurrency} keyboardType="number-pad" editable={supported && !save.isPending} />
    <Field label={copy("Çalışma süresi sınırı (dakika, 0 = sınırsız)", "Run time limit (minutes, 0 = unlimited)")}
      value={minutes} onChangeText={setMinutes} keyboardType="number-pad" editable={supported && !save.isPending && opening.status !== "planning"} />
    {!valid && <Notice tone="warning" message={copy("Görev sınırı 0–8, süre sınırı 0–10080 olmalıdır. Planlama sırasında süre değiştirilemez.", "Task limit must be 0–8 and time limit 0–10080. The time limit cannot change during planning.")} />}
    <FormActions feedback={<MutationState mutation={save} />} submitLabel={copy("Kaydet", "Save")}
      busy={save.isPending} disabled={!supported || !dirty || !valid || save.isPending} onSubmit={() => {
        if (form.values.autoMerge && !opening.autoMerge) confirmAction(copy("Otomatik birleştir", "Auto merge"),
          copy("Denetimleri geçen hedef görevleri ayrıca onay beklemeden birleştirilecek.", "Goal tasks that pass checks will merge without waiting for another approval."), copy("Onayla", "Approve"), submit);
        else submit();
      }} cancelLabel={copy("Vazgeç", "Cancel")} cancelDisabled={save.isPending} onCancel={requestClose} />
  </Stack>;
}
