import { useRef, useState } from "react";
import type { CrewRunView } from "@/remote/contracts/crews";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { useSheetGuard } from "@/ui/sheet-guard";
import { confirmAction } from "@/ui/confirm";
import { Field, FormActions, MultiSelectField, MutationState, Notice, SelectField, Stack, ToggleField } from "@/ui/primitives";
import { identifier } from "../shared/format";

export function CrewAssignmentEditor({ run, onClose }: { run: CrewRunView; onClose: () => void }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [machineId] = useState(machine?.id);
  const [requestId] = useState(identifier);
  const [memberId, setMemberId] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState("");
  const [verifyCommand, setVerifyCommand] = useState("");
  const [integration, setIntegration] = useState(false);
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const sending = useRef(false);
  const mutation = useHostMutation("crews.assign", ["crews", run.projectId]);
  const supported = machine?.id === machineId && machine?.capabilities?.includes("crews.tasks.v1") === true;
  const locked = mutation.isPending || sent || !supported;
  const { requestClose } = useSheetGuard({ dirty: !!(title || prompt || files || memberId || integration || dependsOn.length || verifyCommand), pending: mutation.isPending, onClose });
  const scopes = files.split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
  const valid = memberId && title.trim() && title.length <= 160 && prompt.trim() && (integration || scopes.length);
  const submit = () => {
    if (!valid || !supported || sending.current || run.status !== "active" || useMachines.getState().activeId !== machineId) return;
    sending.current = true; setSent(true);
    mutation.mutate({ projectId: run.projectId, runId: run.id, requestId, memberId, title: title.trim(), prompt: prompt.trim(),
      files: integration ? ["."] : scopes, integration, dependsOn: integration ? run.assignments.map((entry) => entry.taskId) : dependsOn,
      verifyCommand: verifyCommand.trim() || undefined }, { onSuccess: onClose });
  };
  return <Stack>
    <SelectField searchable label={copy("Görevlendirilecek üye", "Assigned member")} value={memberId} disabled={locked}
      options={run.definition.agents.filter((agent) => agent.role === "specialist" || agent.role === "advisor").map((agent) => ({ value: agent.id, label: agent.name }))} onChange={setMemberId} />
    <Field label={copy("Görev başlığı", "Task title")} value={title} onChangeText={setTitle} editable={!locked} />
    <Field label={copy("Görev talimatları", "Task instructions")} value={prompt} onChangeText={setPrompt} editable={!locked} multiline />
    <ToggleField label={copy("Son entegrasyon incelemesi", "Final integration review")} value={integration} onChange={setIntegration} disabled={locked} />
    {integration ? <Notice tone="info" message={copy("Entegrasyon görevi tüm mevcut görevlere bağlıdır ve proje kapsamını kullanır.", "Integration depends on every existing task and uses project scope.")} />
      : <Field label={copy("Yazma kapsamları (satır başına proje yolu)", "Write scopes (project path per line)")} value={files} onChangeText={setFiles} editable={!locked} multiline />}
    {!integration && <MultiSelectField searchable label={copy("Bağımlı görevler", "Task dependencies")} values={dependsOn} onChange={setDependsOn} disabled={locked}
      options={run.assignments.map((entry) => ({ value: entry.taskId, label: entry.title }))} />}
    <Field label={copy("Doğrulama komutu (isteğe bağlı)", "Verification command (optional)")} value={verifyCommand} onChangeText={setVerifyCommand} editable={!locked} />
    {sent && mutation.isError && <Notice tone="warning" message={copy("İsteğin durumu belirsiz olabilir. Yeniden görev oluşturmadan çalışma listesini yenileyin.", "Request delivery may be uncertain. Refresh work before creating another assignment.")} />}
    <FormActions submitLabel={copy("Görevi başlat", "Start task")} disabled={!valid || locked} busy={mutation.isPending} onCancel={requestClose} cancelDisabled={mutation.isPending}
      cancelLabel={copy("Vazgeç", "Cancel")} feedback={<MutationState mutation={mutation} />} onSubmit={() => confirmAction(copy("Ekip görevi başlat", "Start crew task"),
        copy("Görev bilgisayarda çalışır; host kapsam, bütçe ve bağımsız inceleme kurallarını uygular.", "The task runs on the computer; the host enforces scope, budget and independent review."), copy("Başlat", "Start"), submit, undefined, "default")} />
  </Stack>;
}
