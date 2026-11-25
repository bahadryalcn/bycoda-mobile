import { useRef, useState } from "react";
import type { HostModelCatalog } from "@/domain/types";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { Button, Loading, Notice, QueryState, SelectField, StateView } from "@/ui/primitives";
import { ProviderIcon } from "@/ui/provider-identity";
import { useSheetGuard } from "@/ui/sheet-guard";
import type { AssistantProfile } from "../../../../src/shared/model/host-contracts/assistant";
import { catalogProviders, sessionModel, sessionModelName } from "../workspace/catalog";
import { providerName } from "../workspace/provider-choices";
import type { AssistantMobileClient } from "./assistant-client";

export function AssistantReplyModel({ client, profile, projectId, disabled, current, reviewRequired, onReviewRequired, onRefresh, onSaved }: {
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
  const locale = useLocale();
  const catalog = useHostQuery<HostModelCatalog>(["models", "assistant", projectId], "models.list", {
    ...(projectId ? { projectId } : {}), progressive: true,
  }, { interval: (data) => data?.pending?.length ? 1000 : false });
  const [confirmed, setConfirmed] = useState<AssistantProfile>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useSheetGuard({ pending: busy });
  const currentProfile = confirmed && confirmed.version > profile.version ? confirmed : profile;
  const execution = currentProfile.replyExecution ?? currentProfile.execution;
  const latest = useRef({ disabled, projectId, reviewRequired, version: currentProfile.version });
  latest.current = { disabled, projectId, reviewRequired, version: currentProfile.version };
  const currentModel = execution ? sessionModel(catalog.data, execution.harness, execution.model) : undefined;
  const selectedValue = execution ? JSON.stringify([execution.harness, currentModel?.id ?? execution.model]) : undefined;
  const providers = catalogProviders(undefined, catalog.data);
  if (execution && !providers.includes(execution.harness)) providers.push(execution.harness);
  const options = providers.flatMap(harness => {
    const group = harness === "codex" ? "OpenAI · Codex" : providerName(harness);
    const icon = <ProviderIcon provider={harness} size={20} />;
    const models = catalog.data?.models[harness] ?? [];
    const rows = models.map(model => ({
      value: JSON.stringify([harness, model.id]), label: model.name, group, icon,
      searchKeywords: harness === "codex" ? "OpenAI Open AI" : undefined,
      harness, model: model.id, savedOnly: false,
    }));
    if (execution && selectedValue && harness === execution.harness && !currentModel) {
      rows.push({
        value: selectedValue, label: sessionModelName(execution), group, icon,
        searchKeywords: harness === "codex" ? "OpenAI Open AI" : undefined,
        harness, model: execution.model, savedOnly: true,
      });
    }
    return rows.sort((first, second) => first.label.localeCompare(second.label, locale, { numeric: true }));
  });
  const hasChoices = options.some(option => !option.savedOnly);
  const refresh = async () => {
    if (latest.current.disabled || pending.current || !current()) return;
    pending.current = true;
    setBusy(true);
    try {
      const refreshed = await onRefresh();
      if (!current() || !refreshed || refreshed.version < latest.current.version) return;
      latest.current.version = refreshed.version;
      setConfirmed(refreshed);
      onReviewRequired(false);
    } catch {
      // The current choice is still unconfirmed. Keep the read-only recovery available.
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return <>
    <QueryState query={catalog} loading="inline" />
    {catalog.isSuccess && !hasChoices ? (
      catalog.data.pending?.length ? (
        <Loading label={copy("Yükleniyor…", "Loading…")} />
      ) : (
        <StateView size="compact" title={copy("Kullanılabilir model yok.", "No models available.")} />
      )
    ) : null}
    <SelectField label={copy("Yanıt modeli", "Reply model")} value={selectedValue}
      options={options} searchable disabled={disabled || busy || reviewRequired || !hasChoices}
      onChange={async (value) => {
        const selected = options.find(option => option.value === value);
        if (!current() || latest.current.disabled || latest.current.reviewRequired || pending.current ||
          latest.current.projectId !== projectId || latest.current.version !== currentProfile.version || !selected || selected.savedOnly ||
          selected.value === selectedValue) return;
        pending.current = true;
        setBusy(true);
        try {
          const saved = await client.updateProfile(currentProfile.version, { replyExecution: {
            harness: selected.harness,
            model: selected.model,
            modelSettings: {},
            runtimeMode: execution?.runtimeMode ?? "supervised",
            maxRunMinutes: execution?.maxRunMinutes ?? 60,
          } });
          if (!current()) return;
          latest.current.version = saved.version;
          setConfirmed(saved);
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
      }} />
    {reviewRequired ? <Notice tone="warning" message={copy(
      "Model değişikliği doğrulanamadı. Geçerli seçimi görmek için yenile.",
      "Could not confirm the model change. Refresh to see the current choice.",
    )}>
      <Button label={copy("Yenile", "Refresh")} tone="secondary" reserveTouchTarget
        disabled={disabled} busy={busy} onPress={() => { void refresh(); }} />
    </Notice> : null}
  </>;
}
