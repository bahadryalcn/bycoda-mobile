import { useEffect, useRef, useState, type ReactNode } from "react";
import type { HostModelCatalog } from "@/domain/types";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { FormActions, Loading, NavigationGroup, Notice, QueryState, StateView } from "@/ui/primitives";
import { useSheetGuard } from "@/ui/sheet-guard";
import type { AssistantProfile } from "../../../../src/shared/model/host-contracts/assistant";
import { catalogProviders } from "../workspace/catalog";
import { ModelPickerField } from "../workspace/model-picker-field";
import { chooseFixedModel, chooseFixedProvider, fixedModelChoices, type FixedModel } from "../workspace/model-selection/fixed-model";
import type { AssistantMobileClient } from "./assistant-client";

/**
 * The reply model as a draft with an explicit Save, like every agent configuration: picking a provider or
 * model changes nothing on the computer until Save. `children` are optional rows that share its group;
 * loading, empty and recovery states sit below the group, never as rows in it.
 */
export function AssistantReplyModel({ client, profile, projectId, disabled, current, reviewRequired, onReviewRequired, onRefresh, onSaved, children }: {
  children?: ReactNode;
  client: AssistantMobileClient;
  profile: AssistantProfile;
  projectId: string;
  disabled: boolean;
  current(): boolean;
  reviewRequired: boolean;
  onReviewRequired(required: boolean): void;
  onRefresh(): Promise<AssistantProfile | undefined>;
  onSaved(profile: AssistantProfile): void;
}) {
  const copy = useCopy();
  const catalog = useHostQuery<HostModelCatalog>(["models", "assistant", projectId], "models.list", {
    ...(projectId ? { projectId } : {}), progressive: true,
  }, { interval: (data) => data?.pending?.length ? 1000 : false });
  const [confirmed, setConfirmed] = useState<AssistantProfile>();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<FixedModel>();
  const pending = useRef(false);
  // A draft belongs to the scope it was made in.
  useEffect(() => { setDraft(undefined); }, [projectId]);
  const currentProfile = confirmed && confirmed.version > profile.version ? confirmed : profile;
  const execution = currentProfile.replyExecution ?? currentProfile.execution;
  const latest = useRef({ disabled, projectId, reviewRequired, version: currentProfile.version });
  latest.current = { disabled, projectId, reviewRequired, version: currentProfile.version };
  const providers = catalogProviders(undefined, catalog.data);
  if (execution && !providers.includes(execution.harness)) providers.push(execution.harness);
  // The assistant stores a provider and model, not a provider account: the shared picker lists
  // providers without their accounts so a chosen account is never silently dropped.
  const providerCatalog = catalog.data ? { ...catalog.data, accounts: undefined } : undefined;
  const saved: FixedModel = execution
    ? { harness: execution.harness, model: execution.model, modelSettings: execution.modelSettings }
    : { harness: providers[0] ?? "claude", model: "" };
  const value = draft ?? saved;
  const unchanged = (next: FixedModel) => !!execution && next.harness === execution.harness && next.model === execution.model &&
    JSON.stringify(next.modelSettings ?? {}) === JSON.stringify(execution.modelSettings ?? {});
  const dirty = !!draft && !!draft.model && !unchanged(draft);
  useSheetGuard({ pending: busy, dirty });
  const { choices, choice, models } = fixedModelChoices(value, providers, providerCatalog,
    copy("Varsayılan hesap", "Default account"), copy("Hesap kullanılamıyor", "Account unavailable"));
  const hasChoices = providers.some(harness => (catalog.data?.models[harness] ?? []).length > 0);
  // Save writes the draft against the version it was made on; an unconfirmed save asks for a refresh.
  const save = async (next: FixedModel) => {
    if (!current() || latest.current.disabled || latest.current.reviewRequired || pending.current ||
      latest.current.projectId !== projectId || latest.current.version !== currentProfile.version || !next.model ||
      unchanged(next)) return;
    pending.current = true;
    setBusy(true);
    try {
      const saved = await client.updateProfile(currentProfile.version, { replyExecution: {
        harness: next.harness,
        model: next.model,
        modelSettings: next.modelSettings ?? {},
        runtimeMode: execution?.runtimeMode ?? "supervised",
        maxRunMinutes: execution?.maxRunMinutes ?? 60,
      } });
      if (!current()) return;
      latest.current.version = saved.version;
      setConfirmed(saved);
      setDraft(undefined);
      onSaved(saved);
    } catch {
      if (current()) {
        latest.current.reviewRequired = true;
        onReviewRequired(true);
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const refresh = async () => {
    if (latest.current.disabled || pending.current || !current()) return;
    pending.current = true;
    setBusy(true);
    try {
      const refreshed = await onRefresh();
      if (!current() || !refreshed || refreshed.version < latest.current.version) return;
      latest.current.version = refreshed.version;
      setConfirmed(refreshed);
      setDraft(undefined);
      onReviewRequired(false);
    } catch {
      // The current choice is still unconfirmed. Keep the read-only recovery available.
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return <>
    <NavigationGroup>
      {children}
      <ModelPickerField variant="row" label={copy("Yanıt modeli", "Reply model")} choices={choices} choice={choice} unavailableAccount={false}
        models={models} model={value.model} settings={value.modelSettings ?? {}} catalog={providerCatalog} ownAgents={false}
        disabled={disabled || busy || reviewRequired || !hasChoices}
        onChooseProvider={(next) => setDraft(chooseFixedProvider(value, next, providerCatalog))}
        onChooseModel={(next, model, settings) => setDraft(chooseFixedModel(value, next, model, settings))}
        onChange={(model, settings) => setDraft({ ...value, model, modelSettings: settings })} />
    </NavigationGroup>
    <QueryState query={catalog} loading="inline" />
    {catalog.isSuccess && !hasChoices ? (
      catalog.data.pending?.length ? (
        <Loading label={copy("Yükleniyor…", "Loading…")} />
      ) : (
        <StateView size="compact" title={copy("Kullanılabilir model yok.", "No models available.")} />
      )
    ) : null}
    {reviewRequired ? <Notice tone="warning" message={copy(
      "Model değişikliği doğrulanamadı. Geçerli seçimi görmek için yenile.",
      "Could not confirm the model change. Refresh to see the current choice.",
    )} action={{ label: copy("Yenile", "Refresh"), onPress: () => { void refresh(); } }} /> : null}
    {dirty || busy ? <FormActions submitLabel={copy("Kaydet", "Save")} cancelLabel={copy("Vazgeç", "Cancel")} dirty={dirty} busy={busy}
      disabled={disabled || reviewRequired || !dirty} cancelDisabled={busy}
      onCancel={() => setDraft(undefined)} onSubmit={() => { if (draft) void save(draft); }} /> : null}
  </>;
}
