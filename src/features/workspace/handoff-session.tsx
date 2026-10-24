import { useRef, useState } from "react";
import { router } from "expo-router";
import type { ContextualSessionInput, ContextualSessionPreview, HostSession, RemoteProvider } from "@/domain/types";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useModelCatalog } from "@/state/model-catalog";
import { useHostQuery } from "@/state/queries";
import { useFormDraft } from "@/state/form-draft";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useCopy } from "@/ui/copy";
import { Body, Button, Disclosure, FormActions, MutationState, Notice, QueryState, SelectField, Stack } from "@/ui/primitives";
import { MessageText } from "@/ui/message-text";
import { catalogProviders, modelDefaults } from "./catalog";
import { CommandError, UncertainCommand } from "./shared";
import { useContextualDelivery } from "./handoff-delivery";
import type { SessionScope } from "./session-types";
import { contextualCommand, contextualReplies, sameContextualInput } from "./handoff-model";
import { useEarlierSession } from "./session-queries";

export function HandoffSession({ scope, source, mode, blocked, onClose }: {
  scope: SessionScope; source: HostSession; mode: ContextualSessionInput["mode"]; blocked: boolean; onClose: () => void;
}) {
  const copy = useCopy();
  const [openingScope] = useState(scope);
  const machine = useActiveMachine();
  const matches = scope.machineId === openingScope.machineId && scope.sessionId === openingScope.sessionId && machine?.id === openingScope.machineId;
  const supported = matches && machine?.capabilities?.includes("sessions.contextual") === true;
  const replies = contextualReplies(source);
  const form = useFormDraft({ sourceBlockId: replies.at(-1)?.id ?? "", harness: "" as RemoteProvider | "", model: "", modelSettings: {} as Record<string, string> });
  const [reviewInput, setReviewInput] = useState<ContextualSessionInput | null>(null);
  const [attempted, setAttempted] = useState(false);
  const occupied = useRef(false);
  const command = useContextualDelivery(openingScope, source.projectId);
  const created = command.receipt;
  const earlier = useEarlierSession(scope, source);
  const uncertain = command.error instanceof UncertainCommand;
  const locked = blocked || command.loading || command.isPending || uncertain || !!created || !supported;
  const catalog = useModelCatalog(source.projectId, supported && !created);
  const providers = catalogProviders(machine?.providers, catalog.data);
  const models = form.values.harness ? catalog.data?.models[form.values.harness] ?? [] : [];
  const selected = models.find((model) => model.id === form.values.model);
  const input: ContextualSessionInput | null = form.values.harness && form.values.model && form.values.sourceBlockId ? {
    sessionId: openingScope.sessionId, sourceBlockId: form.values.sourceBlockId, expectedRevision: source.revision,
    mode, harness: form.values.harness, model: form.values.model, modelSettings: form.values.modelSettings,
  } : null;
  const preview = useHostQuery<ContextualSessionPreview>(["contextual-preview", openingScope.sessionId], "sessions.contextual.preview",
    reviewInput ? { ...reviewInput } : {}, { enabled: supported && !!reviewInput && !created });
  const reviewed = !!preview.data && !!input && sameContextualInput(input, reviewInput) &&
    preview.data.expectedRevision === source.revision && preview.data.digest.length === 64 && !preview.error && !preview.isFetching;
  const { requestClose } = useSheetGuard({ dirty: form.dirty && !created && !attempted, pending: command.isPending || uncertain, onClose });
  const submit = async () => {
    if (locked || !reviewed || !input || !preview.data || occupied.current || attempted || useMachines.getState().activeId !== openingScope.machineId) return;
    occupied.current = true;
    setAttempted(true);
    try { await command.mutateAsync(contextualCommand(openingScope, source, input, preview.data)); }
    catch (error) { if (!(error instanceof UncertainCommand)) setAttempted(false); }
    finally { occupied.current = false; }
  };
  return <Stack>
    {!supported ? <Notice tone="warning" message={copy("Bağlam aktarmak için bu bilgisayardaki bycoda uygulamasını güncelleyin.", "Update bycoda on this computer to transfer context.")} /> : null}
    {command.savedMode && command.savedMode !== mode ? <Notice tone="info" message={copy("Önceki bağlam aktarım isteği önce çözümlenmeli.", "Resolve the previous context-transfer request first.")} /> : null}
    <Body muted>{mode === "handoff" ? copy("Seçili tur özetiyle yeni bir oturum hazırlanır. Bu işlem agent çalıştırmaz.", "Prepare a new session with the selected turn’s recap. This does not run an agent.") :
      copy("Seçili tur için yeni bir oturumda ikinci görüş isteği başlatılır. Hedef agent dosyaları inceleyebilir ve düzeltebilir.", "Start a second-opinion request for the selected turn in a new session. The target agent may inspect and fix files.")}</Body>
    {source.status === "running" ? <Notice tone="warning" message={copy("Bağlam aktarmadan önce çalışmanın bitmesini bekleyin.", "Wait for the run to finish before transferring context.")} /> : null}
    <SelectField label={copy("Kaynak yanıt", "Source reply")} value={form.values.sourceBlockId}
      options={replies.map((block) => ({ value: block.id, label: block.text.replace(/\s+/g, " ").trim().slice(0, 120) || block.id }))}
      onChange={(sourceBlockId) => form.patch({ sourceBlockId })} searchable disabled={locked} />
    {source.history?.before !== undefined ? <Button label={copy("Önceki yanıtları yükle", "Load earlier replies")} tone="quiet" busy={earlier.isPending} disabled={locked}
      onPress={() => earlier.mutate()} /> : null}
    <MutationState mutation={earlier} />
    <QueryState query={catalog} />
    <SelectField label={copy("Hedef agent", "Target agent")} value={form.values.harness}
      options={providers.map((value) => ({ value, label: value }))} disabled={locked}
      onChange={(harness) => form.patch({ harness, model: "", modelSettings: {} })} />
    <SelectField label={copy("Hedef model", "Target model")} value={form.values.model}
      options={models.map((model) => ({ value: model.id, label: model.name }))} disabled={locked || !models.length}
      onChange={(model) => {
        const picked = models.find((item) => item.id === model);
        if (picked) form.patch({ model, modelSettings: modelDefaults(picked) });
      }} />
    {(selected?.settings ?? []).map((setting) => <SelectField key={setting.id} label={setting.label}
      value={form.values.modelSettings[setting.id] ?? setting.value} options={setting.options.map((option) => ({ value: option.value, label: option.label }))}
      disabled={locked} onChange={(value) => form.patch({ modelSettings: { ...form.values.modelSettings, [setting.id]: value } })} />)}
    <Body muted>{copy("Hesap: bilgisayardaki varsayılan hesap. Başka bir hesap seçimi bu köprüde desteklenmiyor.", "Account: the computer’s default account. Selecting another account is not supported by this bridge.")}</Body>
    <Button label={copy("Aktarılacak bağlamı incele", "Review outgoing context")} tone="quiet" disabled={locked || !input || source.status === "running" || !selected}
      busy={preview.isFetching} onPress={() => {
        if (!input) return;
        command.reset();
        if (sameContextualInput(reviewInput, input)) void preview.refetch(); else setReviewInput(input);
      }} />
    {reviewInput ? <QueryState query={preview} /> : null}
    {preview.data ? <>
      {!reviewed ? <Notice tone="warning" message={copy("Seçim veya kaynak değişti. Devam etmeden önce bağlamı yeniden inceleyin.", "The selection or source changed. Review the context again before continuing.")} /> : null}
      <Body>{preview.data.sourceProvider} → {preview.data.harness} · {preview.data.model}</Body>
      <Body mono>{preview.data.cwd}</Body><Body muted>{preview.data.runtimeMode}</Body>
      <MessageText text={preview.data.contextText} compactMedia />
      {preview.data.files.length ? <Disclosure label={copy("Kaydedilmiş dosya kapsamı", "Recorded file scope")}><Body mono>{preview.data.files.join("\n")}</Body></Disclosure> : null}
    </> : null}
    <CommandError error={command.error} onRecovered={(receipt) => { void command.acceptRecovered(receipt).catch(() => {}); }} />
    {created ? <Notice tone="success" message={(command.savedMode ?? mode) === "handoff" ? copy("Devam oturumu hazırlandı.", "The continuation session is ready.") : copy("İkinci görüş isteği bilgisayara ulaştı.", "The computer accepted the second-opinion request.")} /> : null}
    <FormActions submitLabel={created ? copy("Yeni oturumu aç", "Open new session") : mode === "handoff" ? copy("Devam oturumunu hazırla", "Prepare continuation session") : copy("İkinci görüş iste", "Request second opinion")}
      busy={command.isPending} disabled={created ? !matches : locked || !reviewed || attempted || source.status === "running"}
      onSubmit={() => {
        if (created && matches && useMachines.getState().activeId === openingScope.machineId) {
          onClose(); router.push({ pathname: "/session/[id]", params: { id: created.sessionId, machineId: openingScope.machineId, projectId: source.projectId } });
        } else void submit();
      }} onCancel={requestClose} />
  </Stack>;
}
