import { useState } from "react";
import type { HostStewardInput } from "@/remote/types";
import { useFormDraft } from "@/state/form-draft";
import type { useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { IntegerTextStepper } from "@/ui/limit-presets";
import {
  Body,
  Disclosure,
  ErrorText,
  Field,
  FormActions,
  MutationState,
  NavigationGroup,
  Stack,
  ToggleField,
} from "@/ui/primitives";
import { haptic } from "@/ui/motion";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useEffectiveAgent } from "../shared/agent";
import { AgentFields } from "../shared/agent-fields";
import { ScheduleFields } from "../shared/schedule-fields";
import { integerInRange, validScheduleTime } from "../automations/schedule-model";

export function StewardEditor({
  initial,
  save,
  onClose,
}: {
  initial: HostStewardInput & { updatedAt?: number };
  save: ReturnType<typeof useHostMutation>;
  onClose(): void;
}) {
  const copy = useCopy();
  const [expectedConfiguration] = useState(() =>
    initial.updatedAt === undefined ? undefined : JSON.parse(JSON.stringify(initial)),
  );
  const form = useFormDraft(initial);
  const draft = form.values;
  const [agentValid, setAgentValid] = useState(true);
  const [minute, setMinute] = useState(String(initial.minute));
  const [proposals, setProposals] = useState(String(initial.maxProposals));
  const [open, setOpen] = useState(String(initial.maxOpen));
  const normalized = useEffectiveAgent({ ...draft, maxRunMinutes: 0 }, draft.projectId);
  const scheduleValid =
    draft.scheduleKind === "hourly" ? integerInRange(minute, 0, 59) : validScheduleTime(draft.time);
  const valid =
    agentValid &&
    !!normalized.model.trim() &&
    scheduleValid &&
    integerInRange(proposals, 1, 10) &&
    integerInRange(open, 1, 30) &&
    draft.focus.length <= 4000;
  const { requestClose } = useSheetGuard({
    dirty:
      form.dirty ||
      minute !== String(initial.minute) ||
      proposals !== String(initial.maxProposals) ||
      open !== String(initial.maxOpen),
    pending: save.isPending,
    onClose,
  });
  const update = (patch: Partial<HostStewardInput>) => {
    if (!save.isPending) form.patch(patch);
  };
  const blockedReason = !normalized.model.trim()
    ? copy("Bir model seçin.", "Choose a model.")
    : !scheduleValid
      ? copy("Zamanlamayı kontrol edin.", "Check the schedule.")
      : !valid
        ? copy(
            "Odak ve gelişmiş sınırları kontrol edin.",
            "Check the focus and limits in Advanced.",
          )
        : undefined;
  return (
    <Stack>
      <Field
        label={copy("Neye odaklanmalı?", "What should it focus on?")}
        value={draft.focus}
        multiline
        maxLength={4000}
        editable={!save.isPending}
        onChangeText={(focus) => update({ focus })}
      />
      <AgentFields
        value={normalized}
        projectId={draft.projectId}
        disabled={save.isPending}
        onChange={({ maxRunMinutes: _minutes, ...agent }) => update(agent)}
      />
      <ScheduleFields
        value={draft}
        minute={minute}
        onMinuteChange={setMinute}
        onChange={update}
        disabled={save.isPending}
      />
      <Disclosure
        label={copy("Gelişmiş", "Advanced")}
        feedback={
          !integerInRange(proposals, 1, 10) || !integerInRange(open, 1, 30) ? (
            <>
              {!integerInRange(proposals, 1, 10) ? (
                <ErrorText
                  error={`${copy("Çalışma başına öneri", "Proposals per run")}: ${copy("1 ile 10 arasında bir sayı girin.", "Enter a number from 1 to 10.")}`}
                />
              ) : null}
              {!integerInRange(open, 1, 30) ? (
                <ErrorText
                  error={`${copy("Açık görev sınırı", "Open task limit")}: ${copy("1 ile 30 arasında bir sayı girin.", "Enter a number from 1 to 30.")}`}
                />
              ) : null}
            </>
          ) : null
        }
      >
        <AgentFields
          part="settings"
          value={normalized}
          projectId={draft.projectId}
          disabled={save.isPending}
          showRunLimit={false}
          onValidityChange={setAgentValid}
          onChange={({ maxRunMinutes: _minutes, ...agent }) => update(agent)}
        />
        <IntegerTextStepper
          label={copy("Çalışma başına öneri", "Proposals per run")}
          value={proposals}
          min={1}
          max={10}
          onChangeText={setProposals}
          disabled={save.isPending}
        />
        <IntegerTextStepper
          label={copy("Açık görev sınırı", "Open task limit")}
          value={open}
          min={1}
          max={30}
          onChangeText={setOpen}
          disabled={save.isPending}
        />
        <NavigationGroup>
          <ToggleField
            label={copy("Önerilen görevleri otomatik başlat", "Automatically start proposed tasks")}
            detail={copy(
              "Önerilen görevler onay beklemeden başlar.",
              "Start proposed tasks without waiting for approval.",
            )}
            value={draft.autoStart}
            disabled={save.isPending}
            onChange={(autoStart) => update({ autoStart })}
          />
          <ToggleField
            label={copy("Etkin", "Enabled")}
            detail={copy(
              "Planlanan proje incelemelerini çalıştırır.",
              "Run scheduled project reviews.",
            )}
            value={draft.enabled}
            disabled={save.isPending}
            onChange={(enabled) => update({ enabled })}
          />
        </NavigationGroup>
      </Disclosure>
      <FormActions
        feedback={
          <>
            <MutationState mutation={save} />
            {!save.isPending && blockedReason ? <Body muted>{blockedReason}</Body> : null}
          </>
        }
        submitLabel={copy("Kaydet", "Save")}
        cancelLabel={copy("Vazgeç", "Cancel")}
        busy={save.isPending}
        disabled={!valid || save.isPending}
        cancelDisabled={save.isPending}
        onCancel={requestClose}
        onSubmit={() => {
          const { maxRunMinutes: _minutes, ...steward } = normalized;
          save.mutate(
            {
              steward: {
                ...steward,
                minute: Number(minute),
                maxProposals: Number(proposals),
                maxOpen: Number(open),
                expectedConfiguration,
              },
            },
            {
              onSuccess: () => {
                haptic.success();
                onClose();
              },
            },
          );
        }}
      />
    </Stack>
  );
}
