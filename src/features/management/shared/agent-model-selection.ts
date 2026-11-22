import type { HostModelCatalog, RemoteProvider } from "@/domain/types";
import { modelDefaults } from "@/features/workspace/catalog";
import { modelRows } from "@/features/workspace/model-picker-model";
import { filterSelection } from "@/ui/selection-model";
import type { AgentDraft } from "./types";

/** Only an explicit model change migrates settings; catalogue refresh never edits a draft. */
export function selectAgentModel<T extends AgentDraft>(value: T, model: string, catalog?: HostModelCatalog): T {
  if (model === value.model) return value;
  const target = catalog?.models[value.harness]?.find((item) => item.id === model);
  return { ...value, model, modelSettings: target ? modelDefaults(target) : {} };
}

export function selectAgentProvider<T extends AgentDraft>(value: T, harness: RemoteProvider, catalog?: HostModelCatalog): T {
  if (harness === value.harness) return value;
  const target = catalog?.models[harness]?.[0];
  return {
    ...value, harness, providerAccountId: undefined,
    model: target?.id ?? "", modelSettings: target ? modelDefaults(target) : {},
  };
}

/** Keep the saved choice visible while browsing the provider catalogue. */
export function agentModelChoices(catalog: HostModelCatalog | undefined, harness: RemoteProvider, search: string, locale?: string, selected = "") {
  return filterSelection(modelRows(catalog?.models[harness] ?? [], selected), search, locale);
}
