import { useState } from "react";
import {
  Body,
  Stack,
  Disclosure,
  MutationState,
  MultiSelectField,
  SelectField,
  Field,
  FormActions,
  NavigationGroup,
  Row,
  ToggleField,
  QueryState,
  Notice,
} from "@/ui/primitives";
import { haptic } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { useFormDraft } from "@/state/form-draft";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useActiveMachine } from "@/state/machines";
import type { HostGoal, HostGoalInput } from "@/domain/types";
import { AgentFields } from "../shared/agent-fields";
import { identifier } from "../shared/format";
import { initialAgent, useEffectiveAgent } from "../shared/agent";
import type { GoalEditorProps } from "./types";
import { deduplicateProjects } from "../../workspace/activity-model";
import { useHostClient, useHostQuery } from "@/state/queries";
import { GoalCreateDelivery } from "./create-delivery";
import { useConnectionScope } from "@/state/connection-scope";
import type { CrewDirectory } from "@/remote/contracts/crews";
import { validateCrewDirectory } from "../crews/model";
import { useReadRetryNotice } from "@/ui/query-state";
import { isTransientConnectionError } from "@/state/query-retry";

export function GoalEditor({
  projectId,
  projects,
  providers,
  create,
  busy,
  onClose,
}: GoalEditorProps) {
  const copy = useCopy();
  const [agentValid, setAgentValid] = useState(true);
  const machine = useActiveMachine();
  const connection = useConnectionScope();
  const [opening] = useState(connection);
  const client = useHostClient();
  const [originalClient] = useState(() => client);
  const [delivery] = useState(() => new GoalCreateDelivery());
  const [checking, setChecking] = useState(false);
  const [deliveryError, setDeliveryError] = useState<unknown>();
  const form = useFormDraft<HostGoalInput>(() => ({
    ...initialAgent(providers),
    id: identifier(),
    title: "",
    prompt: "",
    projectIds: projectId ? [projectId] : [],
    leadProjectId: projectId,
    verifyDefaults: { review: false },
    approvePlan: true,
    autoMerge: false,
    continueUntilDone: true,
  }));
  const draft = form.values;
  const { requestClose } = useSheetGuard({
    dirty: form.dirty || !agentValid,
    pending: busy || checking || !!delivery.pending,
    onClose,
  });
  const choices = deduplicateProjects(projects, draft.leadProjectId);
  const normalized = useEffectiveAgent(draft, draft.leadProjectId);
  const crewsSupported =
    opening.isCurrent() &&
    draft.projectIds.length === 1 &&
    machine?.capabilities?.includes("crews.tasks.v1") === true;
  const crews = useHostQuery<CrewDirectory>(
    ["crews", draft.leadProjectId, opening.token],
    "crews.list",
    { projectId: draft.leadProjectId },
    {
      enabled: crewsSupported,
      queryFn: async (client, signal) =>
        validateCrewDirectory(
          await client.request("crews.list", { projectId: draft.leadProjectId }, { signal }),
          draft.leadProjectId,
        ),
    },
  );
  const crewDirectory = crewsSupported ? crews.data : undefined;
  // A dropped link refetches itself; a refresh warning waits out the same grace as other reads.
  const crewsGraceElapsed = useReadRetryNotice(
    crews.isError && isTransientConnectionError(crews.error),
    machine?.id ?? null,
  );
  const crewsRefreshFailed =
    crews.isError && (!isTransientConnectionError(crews.error) || crewsGraceElapsed);
  const crewValid =
    !draft.crewDefinitionId ||
    (crewsSupported &&
      crews.isSuccess &&
      crewDirectory?.definitions.some((crew) => crew.id === draft.crewDefinitionId));
  const update = (patch: Partial<HostGoalInput>) => {
    if (!busy && !delivery.busy && !delivery.pending) form.patch(patch);
  };
  const submit = async () => {
    if (delivery.busy || !opening.isCurrent() || !crewValid || !originalClient) return;
    setChecking(true);
    setDeliveryError(undefined);
    try {
      await delivery.submit(
        normalized,
        opening.isCurrent,
        () => originalClient.request<HostGoal[]>("goals.list", {}),
        (goal) => create.mutateAsync({ goal }),
      );
      haptic.success();
      onClose();
    } catch (error) {
      setDeliveryError(error);
    } finally {
      setChecking(false);
    }
  };
  const blockedReason = !draft.title.trim()
    ? copy("Bir başlık girin.", "Enter a title.")
    : !draft.prompt.trim()
      ? copy("Ulaşılacak sonucu yazın.", "Describe the desired outcome.")
      : !draft.projectIds.length
        ? copy("Bir proje seçin.", "Choose a project.")
        : !normalized.model.trim()
          ? copy("Bir model seçin.", "Choose a model.")
          : !crewValid
            ? copy(
                "Gelişmiş bölümündeki ekip seçimini kontrol edin.",
                "Check the crew selection in Advanced.",
              )
            : !agentValid
              ? copy(
                  "Gelişmiş bölümündeki süre sınırını kontrol edin.",
                  "Check the run limit in Advanced.",
                )
              : !opening.isCurrent()
                ? copy(
                    "Seçili bilgisayar değişti. Ayarları yeniden açın.",
                    "The selected computer changed. Reopen the settings.",
                  )
                : undefined;
  return (
    <Stack>
      <Field
        editable={!busy}
        label={copy("Başlık", "Title")}
        value={draft.title}
        onChangeText={(title) => update({ title })}
      />
      <Field
        editable={!busy}
        label={copy("Ulaşılacak sonuç", "Desired outcome")}
        value={draft.prompt}
        onChangeText={(prompt) => update({ prompt })}
        multiline
      />
      <MultiSelectField
        label={copy("Projeler", "Projects")}
        values={draft.projectIds}
        options={choices.map((project) => ({
          value: project.id,
          label: project.name,
          detail: project.cwd,
        }))}
        max={8}
        hint={copy(
          "Aynı bilgisayardan en fazla 8 proje seçin.",
          "Choose up to 8 projects on this computer.",
        )}
        disabled={busy}
        onChange={(ids) =>
          update({
            projectIds: ids,
            crewDefinitionId:
              ids.length === 1 && ids[0] === draft.leadProjectId
                ? draft.crewDefinitionId
                : undefined,
            leadProjectId: ids.includes(draft.leadProjectId) ? draft.leadProjectId : (ids[0] ?? ""),
          })
        }
      />
      <AgentFields
        disabled={busy}
        value={draft}
        projectId={draft.leadProjectId}
        onChange={(agent) => update(agent)}
      />
      <Disclosure label={copy("Gelişmiş", "Advanced")}>
        {draft.projectIds.length > 1 ? (
          <SelectField
            label={copy("Planlayıcının başlangıç projesi", "Planner lead project")}
            value={draft.leadProjectId}
            options={choices
              .filter((project) => draft.projectIds.includes(project.id))
              .map((project) => ({ value: project.id, label: project.name, detail: project.cwd }))}
            disabled={busy || !draft.projectIds.length}
            onChange={(leadProjectId) => update({ leadProjectId, crewDefinitionId: undefined })}
          />
        ) : null}
        {crewsSupported && crewDirectory === undefined && (
          <QueryState query={crews} loading="inline" />
        )}
        {crewsSupported && crewDirectory !== undefined && crewsRefreshFailed && (
          <Notice
            tone="warning"
            message={copy(
              "Ekip listesi yenilenemedi. Seçiminiz korunur; kaydetmeden önce yeniden deneyin.",
              "The crew list could not be refreshed. Your selection is kept; retry before saving.",
            )}
            retryLabel={copy("Yeniden dene", "Retry")}
            retrying={crews.isFetching}
            onRetry={() => {
              if (opening.isCurrent() && !crews.isFetching) void crews.refetch().catch(() => {});
            }}
          />
        )}
        {!opening.isCurrent() && (
          <Notice
            tone="warning"
            message={copy(
              "Seçili bilgisayar değişti. Ayarları yeniden açın.",
              "The selected computer changed. Reopen the settings.",
            )}
          />
        )}
        {crewsSupported && crews.isSuccess && crewDirectory?.definitions.length ? (
          <SelectField
            label={copy("Çalışan türü", "Worker type")}
            hint={copy(
              "Ekip yalnızca tek projeli epic için kullanılabilir.",
              "Crews are available for single-project epics.",
            )}
            value={draft.crewDefinitionId ? "crew" : "agent"}
            disabled={busy}
            options={[
              { value: "agent", label: copy("Ajan", "Agent") },
              { value: "crew", label: copy("Ekip", "Crew") },
            ]}
            onChange={(value) =>
              update({
                crewDefinitionId: value === "crew" ? crewDirectory?.definitions[0]?.id : undefined,
              })
            }
          />
        ) : null}
        {draft.crewDefinitionId ? (
          <SelectField
            label={copy("Ekip", "Crew")}
            value={draft.crewDefinitionId}
            disabled={busy || !crewsSupported || !crews.isSuccess}
            options={(crewDirectory?.definitions ?? []).map((crew) => ({
              value: crew.id,
              label: crew.name,
            }))}
            onChange={(crewDefinitionId) => update({ crewDefinitionId })}
          />
        ) : null}
        <AgentFields
          part="settings"
          onValidityChange={setAgentValid}
          disabled={busy}
          value={draft}
          projectId={draft.leadProjectId}
          onChange={(agent) => update(agent)}
        />
        <NavigationGroup>
          <ToggleField
            disabled={busy}
            label={copy("Çalışmadan önce planı onayla", "Approve the plan before work")}
            detail={copy(
              "Görevler planı onayladıktan sonra başlar. Otomatik Git birleştirmesi kapalıdır.",
              "Tasks start after you approve the plan. Automatic Git merging is off.",
            )}
            value={draft.approvePlan}
            onChange={(approvePlan) => update({ approvePlan })}
          />
          <ToggleField
            disabled={busy}
            label={copy("Görevleri incelet", "Review tasks")}
            detail={copy(
              "Tamamlanan görevleri bir ajan inceler.",
              "An agent reviews completed tasks.",
            )}
            value={draft.verifyDefaults.review}
            onChange={(review) => update({ verifyDefaults: { ...draft.verifyDefaults, review } })}
          />
        </NavigationGroup>
      </Disclosure>
      <FormActions
        feedback={
          <>
            {deliveryError != null && (
              <Notice
                tone="warning"
                message={
                  deliveryError instanceof Error ? deliveryError.message : String(deliveryError)
                }
              />
            )}
            <MutationState mutation={create} />
            {!busy && !checking && blockedReason ? <Body muted>{blockedReason}</Body> : null}
          </>
        }
        submitLabel={copy("Planlamayı başlat", "Start planning")}
        busy={create.isPending || checking}
        disabled={!!blockedReason || busy || checking}
        onSubmit={() => {
          void submit();
        }}
        cancelDisabled={busy || checking || !!delivery.pending}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
      />
    </Stack>
  );
}
