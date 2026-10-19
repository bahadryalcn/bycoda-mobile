import { useState } from "react";
import { Body, Disclosure, Field, FormActions, MutationState, NavigationGroup, Stack, ToggleField } from "@/ui/primitives";
import { haptic } from "@/ui/motion";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useCopy } from "@/ui/copy";
import { useFormDraft } from "@/state/form-draft";
import { AgentFields } from "../shared/agent-fields";
import { useEffectiveAgent } from "../shared/agent";
import type { TaskDraft, TaskEditorProps } from "./types";
import { useActiveMachine } from "@/state/machines";

export function TaskEditor({ initial, save, busy, onClose }: TaskEditorProps) {
  const copy = useCopy();
  const [agentValid, setAgentValid] = useState(true);
  const machine = useActiveMachine();
  const form = useFormDraft(initial);
  const draft = form.values;
  const { requestClose } = useSheetGuard({ dirty: form.dirty || !agentValid, pending: busy, onClose });
  const normalized = useEffectiveAgent(draft, draft.projectId);
  const set = (patch: Partial<TaskDraft>) => {
    if (!busy) form.patch(patch);
  };
  return (
    <Stack>
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
        onValidityChange={setAgentValid}
        disabled={busy}
        value={draft}
        projectId={draft.projectId}
        onChange={(agent) => set(agent)}
      />
      <Disclosure label={copy("Çalışma seçenekleri", "Execution options")}>
      {machine?.capabilities?.includes("tasks.workspaces") && <>
        <Field label={copy("Çalışma klasörü (isteğe bağlı)", "Checkout folder (optional)")} value={draft.workspace?.checkoutCwd ?? ""} editable={!busy} autoCapitalize="none" autoCorrect={false} onChangeText={(checkoutCwd) => set({ workspace: { ...draft.workspace, checkoutCwd } })} />
        <Field label={copy("Başlangıç ve teslim dalı (isteğe bağlı)", "Base and delivery branch (optional)")} value={draft.workspace?.baseBranch ?? ""} editable={!busy} autoCapitalize="none" autoCorrect={false} onChangeText={(baseBranch) => set({ workspace: { ...draft.workspace, baseBranch } })} />
        <Body muted>{copy("Boş bırakırsanız projenin mevcut klasörü ve dalı kullanılır. Bilgisayar seçilen çalışma alanını doğrular.", "Leave blank to use the project's current checkout and branch. The computer validates the selected workspace.")}</Body>
      </>}
      <NavigationGroup>
        <ToggleField
          disabled={busy}
          label={copy("Ayrı çalışma dalı", "Isolated branch")}
          value={draft.isolate !== false}
          onChange={(isolate) => set({ isolate, autoMerge: false })}
        />
        <ToggleField
          disabled={busy}
          label={copy("Ajan incelemesi", "Agent review")}
          value={draft.review !== false}
          onChange={(review) => set({ review })}
        />
        <ToggleField
          disabled={busy}
          label={copy("Tamamlayana kadar devam et", "Continue until done")}
          value={!!draft.continueUntilDone}
          onChange={(continueUntilDone) => set({ continueUntilDone })}
        />
      </NavigationGroup>
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
        feedback={<MutationState mutation={save} />}
        submitLabel={copy("Kaydet", "Save")}
        disabled={!agentValid || busy || !draft.title.trim() || !normalized.model.trim()}
        busy={save.isPending}
        onSubmit={() => save.mutate({ task: normalized }, { onSuccess: () => { haptic.success(); onClose(); } })}
        cancelDisabled={busy}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={requestClose}
      />
    </Stack>
  );
}
