import { useState } from "react";
import type { HostStewardInput } from "@/remote/types";
import { useFormDraft } from "@/state/form-draft";
import { useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Disclosure, ErrorText, Field, FormActions, MutationState, NavigationGroup, Stack, ToggleField } from "@/ui/primitives";
import { haptic } from "@/ui/motion";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useEffectiveAgent } from "../shared/agent";
import { AgentFields } from "../shared/agent-fields";
import { ScheduleFields } from "../shared/schedule-fields";
import { integerInRange, validScheduleTime } from "../automations/schedule-model";

export function StewardEditor({ initial, onClose }: { initial: HostStewardInput; onClose(): void }) {
  const copy = useCopy();
  const form = useFormDraft(initial);
  const draft = form.values;
  const [agentValid, setAgentValid] = useState(true);
  const [minute, setMinute] = useState(String(initial.minute));
  const [proposals, setProposals] = useState(String(initial.maxProposals));
  const [open, setOpen] = useState(String(initial.maxOpen));
  const save = useHostMutation("stewards.save", ["stewards"]);
  const normalized = useEffectiveAgent({ ...draft, maxRunMinutes: 0 }, draft.projectId);
  const scheduleValid = draft.scheduleKind === "hourly" ? integerInRange(minute, 0, 59) : validScheduleTime(draft.time);
  const valid = agentValid && !!normalized.model.trim() && scheduleValid && integerInRange(proposals, 1, 10) && integerInRange(open, 1, 30) && draft.focus.length <= 4000;
  const { requestClose } = useSheetGuard({
    dirty: form.dirty || minute !== String(initial.minute) || proposals !== String(initial.maxProposals) || open !== String(initial.maxOpen),
    pending: save.isPending, onClose,
  });
  const update = (patch: Partial<HostStewardInput>) => { if (!save.isPending) form.patch(patch); };
  return <Stack>
    <Field label={copy("Odak", "Focus")} value={draft.focus} multiline maxLength={4000} editable={!save.isPending}
      onChangeText={(focus) => update({ focus })} />
    <AgentFields value={normalized} projectId={draft.projectId} disabled={save.isPending} showRunLimit={false}
      onValidityChange={setAgentValid} onChange={({ maxRunMinutes: _minutes, ...agent }) => update(agent)} />
    <ScheduleFields value={draft} minute={minute} onMinuteChange={setMinute} onChange={update} disabled={save.isPending} />
    <Disclosure label={copy("Gelişmiş seçenekler", "Advanced options")}>
      <Field label={copy("Çalışma başına öneri (1–10)", "Proposals per run (1–10)")} value={proposals}
        onChangeText={setProposals} keyboardType="number-pad" editable={!save.isPending} />
      {!integerInRange(proposals, 1, 10) ? <ErrorText error={copy("1 ile 10 arasında bir sayı girin.", "Enter a number from 1 to 10.")} /> : null}
      <Field label={copy("Açık görev sınırı (1–30)", "Open task limit (1–30)")} value={open}
        onChangeText={setOpen} keyboardType="number-pad" editable={!save.isPending} />
      {!integerInRange(open, 1, 30) ? <ErrorText error={copy("1 ile 30 arasında bir sayı girin.", "Enter a number from 1 to 30.")} /> : null}
      <NavigationGroup>
        <ToggleField label={copy("Önerilen görevleri otomatik başlat", "Automatically start proposed tasks")}
          value={draft.autoStart} disabled={save.isPending} onChange={(autoStart) => update({ autoStart })} />
      </NavigationGroup>
    </Disclosure>
    <NavigationGroup>
      <ToggleField label={copy("Etkin", "Enabled")} value={draft.enabled} disabled={save.isPending} onChange={(enabled) => update({ enabled })} />
    </NavigationGroup>
    <FormActions
      feedback={<><MutationState mutation={save} /></>} submitLabel={copy("Kaydet", "Save")} cancelLabel={copy("Vazgeç", "Cancel")} busy={save.isPending}
      disabled={!valid || save.isPending} cancelDisabled={save.isPending} onCancel={requestClose}
      onSubmit={() => {
        const { maxRunMinutes: _minutes, ...steward } = normalized;
        save.mutate({ steward: { ...steward, minute: Number(minute), maxProposals: Number(proposals), maxOpen: Number(open) } }, { onSuccess: () => { haptic.success(); onClose(); } });
      }} />
  </Stack>;
}
