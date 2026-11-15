import { ScheduleFields } from "../shared/schedule-fields";
import { SchedulePreview } from "./schedule-preview";
import { useState } from "react";
import { router } from "expo-router";
import {
  Stack,
  Field,
  Section,
  FormActions,
  MutationState,
  NavigationGroup,
  ToggleField,
  SelectField,
  Body,
  Button,
} from "@/ui/primitives";
import { haptic } from "@/ui/motion";
import { useSheetGuard } from "@/ui/sheet-guard";
import { automationTriggerValid, integerInRange, validScheduleTime } from "./schedule-model";
import { useCopy } from "@/ui/copy";
import { NumberField } from "@/ui/number-field";
import { useFormDraft } from "@/state/form-draft";
import type { HostAutomationInput } from "@/domain/types";
import { AgentFields } from "../shared/agent-fields";
import { useEffectiveAgent } from "../shared/agent";
import type { AutomationEditorProps } from "./types";

export function AutomationEditor({ initial, save, busy, onClose }: AutomationEditorProps) {
  const copy = useCopy();
  const [expectedConfiguration] = useState(() =>
    initial.updatedAt === undefined ? undefined : JSON.parse(JSON.stringify(initial)),
  );
  const [agentValid, setAgentValid] = useState(true);
  const form = useFormDraft(initial);
  const draft = form.values;
  const [minute, setMinute] = useState(String(initial.minute));
  const [limit, setLimit] = useState(String(initial.maxRunsPerDay));
  const [gap, setGap] = useState(String(initial.trigger?.kind === "continuous" ? initial.trigger.minimumGapMinutes : 5));
  const { requestClose } = useSheetGuard({
    dirty:
      form.dirty ||
      !agentValid ||
      minute !== String(initial.minute) ||
      limit !== String(initial.maxRunsPerDay) || gap !== String(initial.trigger?.kind === "continuous" ? initial.trigger.minimumGapMinutes : 5),
    pending: busy,
    onClose,
  });
  const minuteValid = integerInRange(minute, 0, 59);
  const limitValid = integerInRange(limit, 0, 1000);
  const gapValid = automationTriggerValid("continuous", gap, true);
  const timeValid = validScheduleTime(draft.time);
  const scheduleValid = automationTriggerValid(draft.trigger?.kind ?? "scheduled", gap, draft.scheduleKind === "hourly" ? minuteValid : timeValid) && limitValid;
  const normalized = useEffectiveAgent(draft, draft.projectId);
  const update = (patch: Partial<HostAutomationInput>) => {
    if (!busy) form.patch(patch);
  };
  return (
    <Stack>
      <Section title={copy("Görev", "Task")}>
        <Field
          editable={!busy}
          label={copy("Ad", "Name")}
          value={draft.name}
          onChangeText={(name) => update({ name })}
        />
        <Field
          editable={!busy && !draft.template}
          label={copy("Ne yapmalı?", "What should it do?")}
          value={draft.prompt}
          onChangeText={(prompt) => update({ prompt })}
          multiline
        />
        {draft.template?.kind === "project-scan" ? <>
          <Body muted>{copy("Proje taraması talimatları Steward tanımından gelir.", "Project scan instructions come from the Steward definition.")}</Body>
          <Button label={copy("Proje taramasını düzenle", "Edit project scan")} disabled={busy}
            onPress={() => router.navigate("/manage/stewards")} />
        </> : null}
      </Section>
      <Section title={copy("Ajan", "Agent")}>
        <AgentFields
          onValidityChange={setAgentValid}
          disabled={busy}
          value={draft}
          projectId={draft.projectId}
          onChange={(agent) => update(agent)}
        />
      </Section>
      <Section title={copy("Zamanlama", "Schedule")}>
        <SelectField label={copy("Tetikleyici", "Trigger")} value={draft.trigger?.kind ?? "scheduled"} disabled={busy}
          options={[{ value: "scheduled", label: copy("Zamanlanmış", "Scheduled") }, { value: "continuous", label: copy("Sürekli", "Continuous") }, { value: "event", label: copy("Olay", "Event") }]}
          onChange={kind => update({ trigger: kind === "continuous" ? { kind, minimumGapMinutes: Number(gap) } : kind === "event" ? { kind, event: "task.finished" } : undefined })} />
        {!draft.projectId ? <Body muted>{copy("Bu otomasyon Room içinde çalışır.", "This automation runs in Room.")}</Body> : null}
        {draft.trigger?.kind === "continuous" ? <NumberField label={copy("En az bekleme (dakika)", "Minimum gap (minutes)")} value={gap} editable={!busy} onChangeText={setGap}
          error={gapValid ? undefined : copy("1 ile 10080 arasında dakika girin.", "Enter minutes from 1 to 10080.")} /> : null}
        {draft.trigger?.kind === "event" ? <SelectField label={copy("Olay", "Event")} value={draft.trigger.event} disabled={busy}
          options={(["task.finished", "task.blocked", "session.waiting", "automation.failed"] as const).map(value => ({ value, label: value }))}
          onChange={event => update({ trigger: { kind: "event", event } })} /> : null}
        {!draft.trigger ? <>
        <ScheduleFields
          value={draft}
          minute={minute}
          onMinuteChange={setMinute}
          onChange={update}
          disabled={busy}
        />
        </> : null}
        <NumberField
          editable={!busy}
          label={copy("Günlük çalıştırma sınırı", "Daily run limit")}
          unit={copy("çalıştırma", "runs")}
          hint={copy("0 = sınırsız", "0 = unlimited")}
          error={limitValid ? undefined : copy("0 ile 1000 arasında bir sınır girin.", "Enter a limit from 0 to 1000.")}
          value={limit}
          onChangeText={setLimit}
        />
        {!draft.trigger ? <SchedulePreview disabled={busy} valid={draft.scheduleKind === "hourly" ? minuteValid : timeValid}
          schedule={{ scheduleKind: draft.scheduleKind, time: draft.time, minute: Number(minute), dayOfWeek: draft.dayOfWeek }} />
          : null}
      </Section>
      <Section title={copy("Durum", "Status")}>
        <NavigationGroup>
          <ToggleField
            disabled={busy}
            label={copy("Etkin", "Enabled")}
            value={draft.enabled}
            onChange={(enabled) => update({ enabled })}
          />
        </NavigationGroup>
      </Section>
      <FormActions
        feedback={
          <>
            <MutationState mutation={save} />
          </>
        }
        submitLabel={copy("Kaydet", "Save")}
        busy={save.isPending}
        disabled={
          !agentValid ||
          !draft.name.trim() ||
          !draft.prompt.trim() ||
          !normalized.model.trim() ||
          !scheduleValid ||
          busy
        }
        onSubmit={() =>
          save.mutate(
            {
              automation: {
                ...normalized,
                trigger: draft.trigger?.kind === "continuous" ? { kind: "continuous", minimumGapMinutes: Number(gap) } : draft.trigger,
                minute: Number(minute),
                maxRunsPerDay: Number(limit),
                expectedConfiguration,
              },
            },
            {
              onSuccess: () => {
                haptic.success();
                onClose();
              },
            },
          )
        }
        cancelDisabled={busy}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
      />
    </Stack>
  );
}
