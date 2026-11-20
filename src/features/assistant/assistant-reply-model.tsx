import { useRef, useState } from "react";
import type { HostModelCatalog } from "@/domain/types";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { Notice, QueryState, SelectField } from "@/ui/primitives";
import { ProviderIcon } from "@/ui/provider-identity";
import type { AssistantProfile } from "../../../../src/shared/model/host-contracts/assistant";
import { catalogProviders, sessionModel, sessionModelName } from "../workspace/catalog";
import { providerName } from "../workspace/provider-choices";
import type { AssistantMobileClient } from "./assistant-client";

export function AssistantReplyModel({ client, profile, projectId, disabled, onSaved }: {
  client: AssistantMobileClient;
  profile: AssistantProfile;
  projectId: string;
  disabled: boolean;
  onSaved(profile: AssistantProfile): void;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const catalog = useHostQuery<HostModelCatalog>(["models", "assistant", projectId], "models.list", {
    ...(projectId ? { projectId } : {}), progressive: true,
  }, { interval: (data) => data?.pending?.length ? 1000 : false });
  const execution = profile.replyExecution ?? profile.execution;
  const [issue, setIssue] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  if (!execution) return null;
  const currentModel = sessionModel(catalog.data, execution.harness, execution.model);
  const selectedValue = JSON.stringify([execution.harness, currentModel?.id ?? execution.model]);
  const providers = [...new Set([...catalogProviders(undefined, catalog.data), execution.harness])];
  const options = providers.flatMap(harness => {
    const group = providerName(harness);
    const icon = <ProviderIcon provider={harness} size={20} />;
    const models = catalog.data?.models[harness] ?? [];
    const rows = models.map(model => ({
      value: JSON.stringify([harness, model.id]), label: model.name, group, icon,
      harness, model: model.id, savedOnly: false,
    }));
    if (harness === execution.harness && !currentModel) {
      rows.push({
        value: selectedValue, label: sessionModelName(execution), group, icon,
        harness, model: execution.model, savedOnly: true,
      });
    }
    return rows.sort((first, second) => first.label.localeCompare(second.label, locale, { numeric: true }));
  });
  const hasChoices = options.some(option => !option.savedOnly);
  return <>
    <QueryState query={catalog} loading="inline" />
    <SelectField label={copy("Yanıt modeli", "Reply model")} value={selectedValue}
      options={options} searchable disabled={disabled || saving || !hasChoices}
      onChange={(value) => {
        const selected = options.find(option => option.value === value);
        if (disabled || pending.current || !selected || selected.savedOnly ||
          selected.value === selectedValue) return;
        pending.current = true;
        setSaving(true);
        setIssue(false);
        void client.updateProfile(profile.version, { replyExecution: {
          ...execution, harness: selected.harness, model: selected.model, modelSettings: {},
        } }).then(onSaved).catch(() => setIssue(true)).finally(() => {
          pending.current = false;
          setSaving(false);
        });
      }} />
    {issue ? <Notice tone="warning" message={copy("Model kaydedilemedi. Yenileyip tekrar dene.", "Could not save the model. Refresh and try again.")} /> : null}
  </>;
}
