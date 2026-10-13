import { useState } from "react";
import { Body, ErrorText, Stack, SelectField, Field, FormActions, MutationState, ToggleField } from "@/ui/primitives";
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
      <SelectField
        label={copy("Zamanlama", "Schedule")}
        value={draft.scheduleKind}
        options={[
          { value: "hourly", label: copy("Saatlik", "Hourly") },
          { value: "daily", label: copy("Günlük", "Daily") },
          { value: "weekdays", label: copy("Hafta içi", "Weekdays") },
          { value: "weekly", label: copy("Haftalık", "Weekly") },
        ]}
        disabled={busy}
        onChange={(scheduleKind) => update({ scheduleKind })}
      />
      {draft.scheduleKind === "hourly" ? (
        <>
        <Field
          editable={!busy}
          label={copy("Her saatin dakikası (0–59)", "Minute of each hour (0–59)")}
          value={minute}
          keyboardType="number-pad"
          onChangeText={setMinute}
        />
        {!minuteValid && <ErrorText error={copy("0 ile 59 arasında bir dakika girin.", "Enter a minute from 0 to 59.")} />}
        </>
      ) : (
        <>
        <Field
          editable={!busy}
          label={copy("Saat (SS:DD)", "Time (HH:MM)")}
          value={draft.time}
          onChangeText={(time) => update({ time })}
          placeholder="09:00"
          keyboardType="numbers-and-punctuation"
        />
        {!timeValid && <ErrorText error={copy("Saati SS:DD biçiminde girin (00:00–23:59).", "Use HH:MM time (00:00–23:59).")} />}
        </>
      )}
      <Body muted>{copy("Bilgisayarın yerel saati kullanılır; sonraki çalışma telefondaki saatle gösterilir.", "Schedules use computer local time; the next run is shown in phone time.")}</Body>
      {draft.scheduleKind === "weekly" ? (
        <SelectField
          label={copy("Gün", "Day")}
          value={String(draft.dayOfWeek)}
          options={[
            { value: "0", label: copy("Pazar", "Sunday") },
            { value: "1", label: copy("Pazartesi", "Monday") },
            { value: "2", label: copy("Salı", "Tuesday") },
            { value: "3", label: copy("Çarşamba", "Wednesday") },
            { value: "4", label: copy("Perşembe", "Thursday") },
            { value: "5", label: copy("Cuma", "Friday") },
            { value: "6", label: copy("Cumartesi", "Saturday") },
          ]}
          disabled={busy}
          onChange={(day) => update({ dayOfWeek: Number(day) })}
        />
      ) : null}
      <Field
        editable={!busy}
        label={copy("Günlük çalıştırma sınırı (0 = sınırsız)", "Daily run limit (0 = unlimited)")}
        value={limit}
        keyboardType="number-pad"
        onChangeText={setLimit}
      />
      {!limitValid && <ErrorText error={copy("0 ile 1000 arasında bir sınır girin.", "Enter a limit from 0 to 1000.")} />}
      <ToggleField
        disabled={busy}
        label={copy("Etkin", "Enabled")}
        value={draft.enabled}
        onChange={(enabled) => update({ enabled })}
      />
      <MutationState mutation={save} />
      <FormActions
        submitLabel={copy("Kaydet", "Save")}
        busy={save.isPending}
        disabled={!agentValid || !draft.name.trim() || !draft.prompt.trim() || !normalized.model.trim() || !scheduleValid || busy}
        onSubmit={() => save.mutate({ automation: { ...normalized, minute: Number(minute), maxRunsPerDay: Number(limit) } }, { onSuccess: () => onClose() })}
        cancelDisabled={busy}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
      />
    </Stack>
  );
}
