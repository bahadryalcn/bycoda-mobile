import { ScheduleFields } from "../shared/schedule-fields";
import { useState } from "react";
import { Body, ErrorText, Stack, Field, FormActions, MutationState, NavigationGroup, ToggleField } from "@/ui/primitives";
import { haptic } from "@/ui/motion";
import { useSheetGuard } from "@/ui/sheet-guard";
import { integerInRange, validScheduleTime } from "./schedule-model";
import { useCopy } from "@/ui/copy";
import { useFormDraft } from "@/state/form-draft";
import type { HostAutomationInput } from "@/domain/types";
import { AgentFields } from "../shared/agent-fields";
import { useEffectiveAgent } from "../shared/agent";
import type { AutomationEditorProps } from "./types";

export function AutomationEditor({ initial, save, busy, onClose }: AutomationEditorProps) {
  const copy = useCopy();
  const [agentValid, setAgentValid] = useState(true);
  const form = useFormDraft(initial);
  const draft = form.values;
  const [minute, setMinute] = useState(String(initial.minute));
  const [limit, setLimit] = useState(String(initial.maxRunsPerDay));
  const { requestClose } = useSheetGuard({ dirty: form.dirty || !agentValid || minute !== String(initial.minute) || limit !== String(initial.maxRunsPerDay), pending: busy, onClose });
  const minuteValid = integerInRange(minute, 0, 59);
  const limitValid = integerInRange(limit, 0, 1000);
  const timeValid = validScheduleTime(draft.time);
  const scheduleValid = (draft.scheduleKind === "hourly" ? minuteValid : timeValid) && limitValid;
  const normalized = useEffectiveAgent(draft, draft.projectId);
  const update = (patch: Partial<HostAutomationInput>) => {
    if (!busy) form.patch(patch);
  };
  return (
    <Stack>
      <Field
        editable={!busy}
        label={copy("Ad", "Name")}
        value={draft.name}
        onChangeText={(name) => update({ name })}
      />
      <Field
        editable={!busy}
        label={copy("Ne yapmalı?", "What should it do?")}
        value={draft.prompt}
        onChangeText={(prompt) => update({ prompt })}
        multiline
      />
      <AgentFields
        onValidityChange={setAgentValid}
        disabled={busy}
        value={draft}
        projectId={draft.projectId}
        onChange={(agent) => update(agent)}
      />
      <ScheduleFields value={draft} minute={minute} onMinuteChange={setMinute} onChange={update} disabled={busy} />
      <Field
        editable={!busy}
        label={copy("Günlük çalıştırma sınırı (0 = sınırsız)", "Daily run limit (0 = unlimited)")}
        value={limit}
        keyboardType="number-pad"
        onChangeText={setLimit}
      />
      {!limitValid && <ErrorText error={copy("0 ile 1000 arasında bir sınır girin.", "Enter a limit from 0 to 1000.")} />}
      <NavigationGroup>
        <ToggleField
          disabled={busy}
          label={copy("Etkin", "Enabled")}
          value={draft.enabled}
          onChange={(enabled) => update({ enabled })}
        />
      </NavigationGroup>
      <FormActions
        feedback={<><MutationState mutation={save} /></>}
        submitLabel={copy("Kaydet", "Save")}
        busy={save.isPending}
        disabled={!agentValid || !draft.name.trim() || !draft.prompt.trim() || !normalized.model.trim() || !scheduleValid || busy}
        onSubmit={() => save.mutate({ automation: { ...normalized, minute: Number(minute), maxRunsPerDay: Number(limit) } }, { onSuccess: () => { haptic.success(); onClose(); } })}
        cancelDisabled={busy}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
      />
    </Stack>
  );
}
