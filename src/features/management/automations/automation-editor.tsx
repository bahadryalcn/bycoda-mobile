import { ScheduleFields } from "../shared/schedule-fields";
import { SchedulePreview } from "./schedule-preview";
import { useRef, useState } from "react";
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
  ErrorNotice,
  Notice,
  showToast,
} from "@/ui/primitives";
import { haptic } from "@/ui/motion";
import { useSheetGuard } from "@/ui/sheet-guard";
import { automationEventLabel, automationTriggerValid, integerInRange, validScheduleTime } from "./schedule-model";
import { useCopy } from "@/ui/copy";
import { LimitPresets, MinuteLimitField } from "@/ui/limit-presets";
import { useFormDraft } from "@/state/form-draft";
import { useSingleFlight } from "@/state/actions";
import { useConnectionScope } from "@/state/connection-scope";
import { RemoteHostError } from "@/remote/host-error";
import type { HostAutomationInput } from "@/domain/types";
import { AgentFields } from "../shared/agent-fields";
import { useEffectiveAgent } from "../shared/agent";
import type { AutomationEditorProps } from "./types";
import { sameAutomationConfiguration } from "./automation-feedback";

type SaveReview = { submitted: HostAutomationInput; phase: "uncertain" | "different" | "missing" | "retry" };

export function AutomationEditor({ initial, save, busy, readSaved, onClose }: AutomationEditorProps) {
  const copy = useCopy();
  const connection = useConnectionScope();
  const submission = useSingleFlight<void>();
  const unresolved = useRef<SaveReview | undefined>(undefined);
  const [review, setReview] = useState<SaveReview>();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<unknown>();
  const report = (next: SaveReview) => { unresolved.current = next; setReview(next); };
  const formLocked = busy || checking || !!review;
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
      !!review || form.dirty ||
      !agentValid ||
      minute !== String(initial.minute) ||
      limit !== String(initial.maxRunsPerDay) || gap !== String(initial.trigger?.kind === "continuous" ? initial.trigger.minimumGapMinutes : 5),
    pending: busy || checking,
    onClose,
  });
  const minuteValid = integerInRange(minute, 0, 59);
  const limitValid = integerInRange(limit, 0, 1000);
  const gapValid = automationTriggerValid("continuous", gap, true);
  const timeValid = validScheduleTime(draft.time);
  const scheduleValid = automationTriggerValid(draft.trigger?.kind ?? "scheduled", gap, draft.scheduleKind === "hourly" ? minuteValid : timeValid) && limitValid;
  const normalized = useEffectiveAgent(draft, draft.projectId);
  const canSave = !busy && !checking && (review ? review.phase === "retry" :
    agentValid && !!draft.name.trim() && !!draft.prompt.trim() && !!normalized.model.trim() && scheduleValid);
  const finish = () => { haptic.success(); onClose(); };
  const submit = () => {
    const pending = unresolved.current;
    if (!canSave || (pending && pending.phase !== "retry") || !connection.isCurrent() || submission.isPending()) return;
    const submitted = pending?.submitted ?? {
      ...normalized,
      trigger: draft.trigger?.kind === "continuous" ? { kind: "continuous" as const, minimumGapMinutes: Number(gap) } : draft.trigger,
      minute: Number(minute),
      maxRunsPerDay: Number(limit),
    };
    setCheckError(undefined);
    void submission.run(async () => {
      if (!connection.isCurrent()) return;
      try {
        await save.mutateAsync({ automation: { ...submitted,
          ...(expectedConfiguration ? { expectedConfiguration } : { expectedAbsent: true }),
        } });
        if (connection.isCurrent()) finish();
      } catch (error) {
        if (connection.isCurrent() && (pending || error instanceof RemoteHostError && error.uncertain)) {
          report({ submitted, phase: "uncertain" });
        }
      }
    }).catch(() => {});
  };
  const checkStatus = () => {
    const pending = unresolved.current;
    if (!pending || busy || !connection.isCurrent() || submission.isPending()) return;
    setChecking(true);
    setCheckError(undefined);
    // Until this read completes, only another deliberate check can unlock resubmission.
    report({ ...pending, phase: "uncertain" });
    void submission.run(async () => {
      try {
        if (!connection.isCurrent()) return;
        const saved = await readSaved(pending.submitted.id);
        if (!connection.isCurrent()) return;
        if (saved && sameAutomationConfiguration(pending.submitted, saved)) {
          save.reset();
          finish();
          showToast({ message: copy("Otomasyon kaydedildi.", "Automation saved.") });
          return;
        }
        const originalStillVisible = saved && expectedConfiguration && sameAutomationConfiguration(expectedConfiguration, saved);
        const phase = !saved ? expectedConfiguration ? "missing" : "retry" : originalStillVisible ? "retry" : "different";
        report({ ...pending, phase });
      } catch (error) {
        if (connection.isCurrent()) setCheckError(error);
      } finally {
        if (connection.isCurrent()) setChecking(false);
      }
    }).catch(() => {});
  };
  const update = (patch: Partial<HostAutomationInput>) => {
    if (!formLocked) form.patch(patch);
  };
  return (
    <Stack>
      <Section title={copy("Görev", "Task")}>
        <Field
          editable={!formLocked}
          label={copy("Ad", "Name")}
          value={draft.name}
          onChangeText={(name) => update({ name })}
        />
        <Field
          editable={!formLocked && !draft.template}
          label={copy("Ne yapmalı?", "What should it do?")}
          value={draft.prompt}
          onChangeText={(prompt) => update({ prompt })}
          multiline
        />
        {draft.template?.kind === "project-scan" ? <>
          <Body muted>{copy("Proje taraması talimatları Steward tanımından gelir.", "Project scan instructions come from the Steward definition.")}</Body>
          <Button label={copy("Proje taramasını düzenle", "Edit project scan")} disabled={formLocked}
            onPress={() => router.navigate("/manage/stewards")} />
        </> : null}
      </Section>
      <Section title={copy("Ajan", "Agent")}>
        <AgentFields
          onValidityChange={setAgentValid}
          disabled={formLocked}
          value={draft}
          projectId={draft.projectId}
          onChange={(agent) => update(agent)}
        />
      </Section>
      <Section title={copy("Zamanlama", "Schedule")}>
        <SelectField label={copy("Tetikleyici", "Trigger")} value={draft.trigger?.kind ?? "scheduled"} disabled={formLocked}
          options={[{ value: "scheduled", label: copy("Zamanlanmış", "Scheduled") }, { value: "continuous", label: copy("Sürekli", "Continuous") }, { value: "event", label: copy("Olay", "Event") }]}
          onChange={kind => update({ trigger: kind === "continuous" ? { kind, minimumGapMinutes: Number(gap) } : kind === "event" ? { kind, event: "task.finished" } : undefined })} />
        {!draft.projectId ? <Body muted>{copy("Bu otomasyon Room içinde çalışır.", "This automation runs in Room.")}</Body> : null}
        {draft.trigger?.kind === "continuous" ? <MinuteLimitField label={copy("En az bekleme", "Minimum gap")} min={1} value={gap} disabled={formLocked} onChange={setGap}
          error={gapValid ? undefined : copy("1 ile 10080 arasında dakika girin.", "Enter minutes from 1 to 10080.")} /> : null}
        {draft.trigger?.kind === "event" ? <SelectField label={copy("Olay", "Event")} value={draft.trigger.event} disabled={formLocked}
          options={(["task.finished", "task.blocked", "session.waiting", "automation.failed"] as const).map(value => ({ value, label: automationEventLabel(value, copy) }))}
          onChange={event => update({ trigger: { kind: "event", event } })} /> : null}
        {!draft.trigger ? <>
        <ScheduleFields
          value={draft}
          minute={minute}
          onMinuteChange={setMinute}
          onChange={update}
          disabled={formLocked}
        />
        </> : null}
        <LimitPresets
          disabled={formLocked}
          label={copy("Günlük çalıştırma sınırı", "Daily run limit")}
          customLabel={copy("Özel", "Custom")}
          unit={copy("çalıştırma", "runs")}
          error={limitValid ? undefined : copy("0 ile 1000 arasında bir sınır girin.", "Enter a limit from 0 to 1000.")}
          value={limit}
          values={["0", "1", "3", "5", "10", "24", "50", "100"]}
          format={(runs) => runs === "0" ? copy("Sınırsız", "Unlimited") : runs}
          onChange={setLimit}
        />
        {!draft.trigger ? <SchedulePreview disabled={formLocked} valid={draft.scheduleKind === "hourly" ? minuteValid : timeValid}
          schedule={{ scheduleKind: draft.scheduleKind, time: draft.time, minute: Number(minute), dayOfWeek: draft.dayOfWeek }} />
          : null}
      </Section>
      <Section title={copy("Durum", "Status")}>
        <NavigationGroup>
          <ToggleField
            disabled={formLocked}
            label={copy("Etkin", "Enabled")}
            value={draft.enabled}
            onChange={(enabled) => update({ enabled })}
          />
        </NavigationGroup>
      </Section>
      <FormActions
        feedback={review ? <>
          <Notice tone="warning" message={review.phase === "retry"
            ? copy("Taslak henüz bilgisayarda görünmüyor. Yeniden kaydedebilirsin.", "The draft is not visible on the computer yet. You can save again.")
            : review.phase === "different"
              ? copy("Bilgisayardaki otomasyon bu taslaktan farklı. Taslak korunuyor.", "The saved automation differs from this draft. Your draft is kept.")
              : review.phase === "missing" ? copy("Otomasyon artık bulunamadı.", "The automation is no longer available.")
              : copy("İşlem uygulanmış olabilir. Yeniden denemeden önce sonucu kontrol et.", "The action may have been applied. Check the result before trying again.")}>
            <Button label={copy("Durumu kontrol et", "Check status")} tone={review.phase === "retry" ? "secondary" : "primary"} reserveTouchTarget
              busy={checking} disabled={busy} onPress={checkStatus} />
          </Notice>
          <ErrorNotice error={checkError} />
        </> : <MutationState mutation={save} />}
        submitLabel={save.isPending ? copy("Kaydediliyor…", "Saving…") : copy("Kaydet", "Save")}
        busy={save.isPending}
        disabled={!canSave}
        onSubmit={submit}
        cancelDisabled={busy || checking}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
      />
    </Stack>
  );
}
