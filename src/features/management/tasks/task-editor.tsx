import { useRef, useState } from "react";
import {
  Body,
  Disclosure,
  Field,
  FormActions,
  MutationState,
  ErrorNotice,
  NavigationGroup,
  Stack,
  SectionHeader,
  SelectField,
  ToggleField,
} from "@/ui/primitives";
import { IntegerTextStepper } from "@/ui/limit-presets";
import { haptic } from "@/ui/motion";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useCopy } from "@/ui/copy";
import { useFormDraft } from "@/state/form-draft";
import { taskRunLimitForSave } from "../task-actions";
import { validAgentRunMinutes } from "../agent-model";
import { AgentFields } from "../shared/agent-fields";
import { useEffectiveAgent } from "../shared/agent";
import type { TaskDraft, TaskEditorProps } from "./types";
import { useActiveMachine } from "@/state/machines";
import { useHostClient } from "@/state/queries";
import type { HostTask } from "@/domain/types";
import { useProjectList } from "../../workspace/use-project-directory";

export function TaskEditor({ initial, save, busy, onClose }: TaskEditorProps) {
  const copy = useCopy();
  const [expectedConfiguration] = useState(() =>
    initial.updatedAt === undefined ? undefined : JSON.parse(JSON.stringify(initial)),
  );
  const [agentValid, setAgentValid] = useState(true);
  const [minutes, setMinutes] = useState(String(initial.maxRunMinutes));
  const minutesValid = validAgentRunMinutes(minutes);
  const machine = useActiveMachine();
  const projects = useProjectList();
  const client = useHostClient();
  const [creationMachine] = useState(machine?.id);
  const attempted = useRef(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string>();
  const form = useFormDraft(initial);
  const draft = form.values;
  const { requestClose } = useSheetGuard({
    dirty:
      form.dirty || minutes !== String(initial.maxRunMinutes) || !agentValid || attempted.current,
    pending: busy || reconciling,
    onClose,
  });
  const normalized = useEffectiveAgent(draft, draft.projectId);
  const set = (patch: Partial<TaskDraft>) => {
    if (!busy) form.patch(patch);
  };
  const blockedReason =
    !projects.directoryReady || !draft.projectId || !projects.isProjectVisible(draft.projectId)
      ? copy("Bir proje seçin.", "Choose a project.")
      : !draft.title.trim()
        ? copy("Bir başlık girin.", "Enter a title.")
        : !normalized.model.trim()
          ? copy("Bir model seçin.", "Choose a model.")
          : !agentValid || (!draft.inheritMaxRunMinutes && !minutesValid)
            ? copy(
                "Gelişmiş bölümündeki süre sınırını kontrol edin.",
                "Check the run limit in Advanced.",
              )
            : undefined;
  return (
    <Stack>
      {initial.updatedAt === undefined ? (
        <SelectField
          label={copy("Proje", "Project")}
          value={draft.projectId}
          options={(projects.data ?? []).map((project) => ({
            value: project.id,
            label: project.name,
          }))}
          disabled={busy || reconciling || attempted.current || !projects.directoryReady}
          onChange={(projectId) => {
            if (projects.isProjectVisible(projectId)) set({ projectId });
          }}
        />
      ) : null}
      <Field
        editable={!busy}
        label={copy("Başlık", "Title")}
        value={draft.title}
        onChangeText={(title) => set({ title })}
      />
      <Field
        editable={!busy}
        label={copy("Ne yapılmalı?", "What should be done?")}
        value={draft.prompt}
        onChangeText={(prompt) => set({ prompt })}
        multiline
      />
      <AgentFields
        disabled={busy}
        value={draft}
        projectId={draft.projectId}
        onChange={(agent) =>
          set({ ...agent, modelSettings: { ...agent.modelSettings, ...draft.modelSettings } })
        }
      />
      <Disclosure label={copy("Gelişmiş", "Advanced")}>
        <AgentFields
          part="settings"
          onValidityChange={setAgentValid}
          disabled={busy}
          value={draft}
          projectId={draft.projectId}
          showRunLimit={false}
          onChange={(agent) =>
            set({ ...agent, modelSettings: { ...agent.modelSettings, ...draft.modelSettings } })
          }
        />
        {machine?.capabilities?.includes("tasks.workspaces") && (
          <>
            <SectionHeader title={copy("Çalışma alanı", "Workspace")} />
            <Field
              label={copy("Çalışma klasörü (isteğe bağlı)", "Working folder (optional)")}
              value={draft.workspace?.checkoutCwd ?? ""}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(checkoutCwd) =>
                set({ workspace: { ...draft.workspace, checkoutCwd } })
              }
            />
            <Field
              label={copy(
                "Başlangıç ve teslim dalı (isteğe bağlı)",
                "Base and delivery branch (optional)",
              )}
              value={draft.workspace?.baseBranch ?? ""}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={(baseBranch) => set({ workspace: { ...draft.workspace, baseBranch } })}
              hint={copy(
                "Boş bırakırsanız projenin mevcut klasörü ve dalı kullanılır. Bilgisayar seçilen çalışma alanını doğrular.",
                "Leave blank to use the project's current checkout and branch. The computer validates the selected workspace.",
              )}
            />
          </>
        )}
        <SectionHeader title={copy("Çalıştırma", "Running")} />
        <NavigationGroup>
          <ToggleField
            disabled={busy}
            label={copy("Alt ajanlar", "Subagents")}
            detail={copy(
              "Ek ajanlar görevin parçalarını yürütebilir.",
              "Agents can delegate parts of this task.",
            )}
            value={draft.modelSettings.crossSubagents !== "[]"}
            onChange={(enabled) =>
              set({
                modelSettings: { ...draft.modelSettings, crossSubagents: enabled ? "" : "[]" },
              })
            }
          />
          <ToggleField
            disabled={busy}
            label={copy("Varsayılan süre sınırını kullan", "Use Work run limit")}
            detail={copy(
              "Bilgisayardaki varsayılan görev süresi kullanılır.",
              "Use the default task duration on the computer.",
            )}
            value={draft.inheritMaxRunMinutes === true}
            onChange={(inherit) => set({ inheritMaxRunMinutes: inherit ? true : undefined })}
          />
          <ToggleField
            disabled={busy}
            label={copy("Ayrı çalışma dalı", "Isolated branch")}
            detail={copy(
              "Değişiklikler ayrı bir Git dalında kalır.",
              "Keep changes on a separate Git branch.",
            )}
            value={draft.isolate !== false}
            onChange={(isolate) => set({ isolate, autoMerge: false })}
          />
          <ToggleField
            disabled={busy}
            label={copy("Ajan incelemesi", "Agent review")}
            detail={copy(
              "Sonucu tamamlamadan önce bir ajan inceler.",
              "An agent reviews the result before completion.",
            )}
            value={draft.review !== false}
            onChange={(review) => set({ review })}
          />
          <ToggleField
            disabled={busy}
            label={copy("Tamamlayana kadar devam et", "Continue until done")}
            detail={copy(
              "Görev bitene kadar çalışmayı sürdürür.",
              "Continue working until the task is complete.",
            )}
            value={!!draft.continueUntilDone}
            onChange={(continueUntilDone) => set({ continueUntilDone })}
          />
        </NavigationGroup>
        {!draft.inheritMaxRunMinutes && (
          <IntegerTextStepper
            disabled={busy}
            label={copy("Süre sınırı (dakika)", "Run limit (minutes)")}
            min={0}
            max={10080}
            value={minutes}
            error={
              !minutesValid
                ? copy("0 ile 10080 arasında dakika girin.", "Enter minutes from 0 to 10080.")
                : undefined
            }
            onChangeText={(text) => {
              setMinutes(text);
              if (validAgentRunMinutes(text)) set({ maxRunMinutes: Number(text) });
            }}
          />
        )}
        <Field
          editable={!busy}
          label={copy("Doğrulama komutu (isteğe bağlı)", "Verification command (optional)")}
          value={draft.verifyCommand ?? ""}
          onChangeText={(verifyCommand) => set({ verifyCommand })}
        />
        {draft.autoMerge && (
          <Body>
            {copy(
              "Bu görev bilgisayarda otomatik birleştirme yetkisiyle kaydedilmiş.",
              "This task already has automatic merge permission on the computer.",
            )}
          </Body>
        )}
      </Disclosure>
      <FormActions
        feedback={
          <>
            <MutationState mutation={save} />
            <ErrorNotice error={reconcileError} />
            {!busy && !reconciling && blockedReason ? <Body muted>{blockedReason}</Body> : null}
          </>
        }
        submitLabel={copy("Kaydet", "Save")}
        disabled={!!blockedReason || busy || reconciling}
        busy={save.isPending || reconciling}
        onSubmit={async () => {
          if (!expectedConfiguration && attempted.current) {
            setReconciling(true);
            setReconcileError(undefined);
            try {
              if (!client || machine?.id !== creationMachine)
                throw new Error(
                  copy(
                    "Önce önceki bilgisayardaki kaydı doğrulayın.",
                    "Check the previous computer before retrying.",
                  ),
                );
              const tasks = await client.request<HostTask[]>("tasks.list", {
                projectId: draft.projectId,
              });
              if (!Array.isArray(tasks))
                throw new Error(copy("Görev kaydı doğrulanamadı.", "Could not verify the task."));
              if (
                tasks.some((task) => task.id === draft.id && task.projectId === draft.projectId)
              ) {
                onClose();
                return;
              }
            } catch (error) {
              setReconcileError(error instanceof Error ? error.message : String(error));
              return;
            } finally {
              setReconciling(false);
            }
          }
          const { status, ...configuration } = normalized;
          if (!expectedConfiguration) attempted.current = true;
          save.mutate(
            {
              task: {
                ...configuration,
                maxRunMinutes: taskRunLimitForSave(configuration),
                ...(expectedConfiguration ? {} : { status }),
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
        cancelDisabled={busy}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
      />
    </Stack>
  );
}
