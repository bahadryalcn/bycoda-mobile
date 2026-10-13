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
  Heading,
  Row,
  ToggleField,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useFormDraft } from "@/state/form-draft";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useActiveMachine } from "@/state/machines";
import type { HostGoalInput } from "@/domain/types";
import { AgentFields } from "../shared/agent-fields";
import { identifier } from "../shared/format";
import { initialAgent, useEffectiveAgent } from "../shared/agent";
import type { GoalEditorProps } from "./types";
import { deduplicateProjects } from "../../workspace/activity-model";

export function GoalEditor({ projectId, projects, create, busy, onClose }: GoalEditorProps) {
  const copy = useCopy();
  const [agentValid, setAgentValid] = useState(true);
  const machine = useActiveMachine();
  const form = useFormDraft<HostGoalInput>(() => ({
    ...initialAgent(machine?.providers),
    id: identifier(),
    title: "",
    prompt: "",
    projectIds: [projectId],
    leadProjectId: projectId,
    verifyDefaults: { review: true },
    approvePlan: true,
    autoMerge: false,
    continueUntilDone: true,
  }));
  const draft = form.values;
  const { requestClose } = useSheetGuard({ dirty: form.dirty || !agentValid, pending: busy, onClose });
  const choices = deduplicateProjects(projects, draft.leadProjectId);
  const normalized = useEffectiveAgent(draft, draft.leadProjectId);
  const update = (patch: Partial<HostGoalInput>) => {
    if (!busy) form.patch(patch);
  };
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
      <Body muted>
        {copy(
          "Aynı bilgisayardan en fazla 8 proje seçin.",
          "Choose up to 8 projects on this computer.",
        )}
      </Body>
      <MultiSelectField
        label={copy("Projeler", "Projects")}
        values={draft.projectIds}
        options={choices.map((project) => ({
          value: project.id,
          label: project.name,
          detail: project.cwd,
        }))}
        max={8}
        disabled={busy}
        onChange={(ids) =>
          update({
            projectIds: ids,
            leadProjectId: ids.includes(draft.leadProjectId) ? draft.leadProjectId : (ids[0] ?? ""),
          })
        }
      />
      <SelectField
        label={copy("Planlayıcının başlangıç projesi", "Planner lead project")}
        value={draft.leadProjectId}
        options={choices
          .filter((project) => draft.projectIds.includes(project.id))
          .map((project) => ({ value: project.id, label: project.name, detail: project.cwd }))}
        disabled={busy || !draft.projectIds.length}
        onChange={(leadProjectId) => update({ leadProjectId })}
      />
      <AgentFields
        onValidityChange={setAgentValid}
        disabled={busy}
        value={draft}
        projectId={draft.leadProjectId}
        onChange={(agent) => update(agent)}
      />
      <Disclosure label={copy("Çalışma seçenekleri", "Execution options")}>
      <ToggleField
        disabled={busy}
        label={copy("Çalışmadan önce planı onayla", "Approve the plan before work")}
        value={draft.approvePlan}
        onChange={(approvePlan) => update({ approvePlan })}
      />
      <ToggleField
        disabled={busy}
        label={copy("Görevleri incelet", "Review tasks")}
        value={draft.verifyDefaults.review}
        onChange={(review) => update({ verifyDefaults: { ...draft.verifyDefaults, review } })}
      />
      <Body muted>
        {copy(
          "Bu yeni hedefte otomatik Git birleştirmesi kapalıdır.",
          "Automatic Git merging is disabled for this new goal.",
        )}
      </Body>
      </Disclosure>
      <MutationState mutation={create} />
      <FormActions
        submitLabel={copy("Planlamayı başlat", "Start planning")}
        busy={create.isPending}
        disabled={
          !agentValid ||
          !draft.title.trim() ||
          !draft.prompt.trim() ||
          !normalized.model.trim() ||
          !draft.projectIds.length ||
          busy
        }
        onSubmit={() => create.mutate({ goal: normalized }, { onSuccess: () => onClose() })}
        cancelDisabled={busy}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
      />
    </Stack>
  );
}
