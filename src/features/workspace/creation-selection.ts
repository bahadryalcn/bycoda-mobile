import { catalogProvider, creationModel, sessionCatalog } from "./catalog";
import { selectedChoice, type ProviderChoice } from "./provider-choices";
import type { HostModelCatalog, RemoteProvider } from "./wire";

export type RuntimeMode = "supervised" | "auto-accept-edits" | "auto" | "full-access";
/** What the owner picked so far; an empty draft means "use the product defaults". */
export type CreationDraft = { provider?: RemoteProvider; accountId?: string; model: string };

/** Resolves a draft against the catalog: provider, account and model the new session would use. */
export function resolveCreationSelection(
  providers: readonly RemoteProvider[],
  hostCatalog: HostModelCatalog | undefined,
  choices: readonly ProviderChoice[],
  draft: CreationDraft,
) {
  const availableCatalog = sessionCatalog(hostCatalog, providers);
  const choice = draft.provider ? selectedChoice(choices, draft.provider, draft.accountId) : undefined;
  const selectedProvider = choice?.provider ?? catalogProvider(providers, availableCatalog, draft.provider);
  const selectedAccountId = choice?.provider === selectedProvider ? choice?.accountId : undefined;
  const models = selectedProvider ? availableCatalog.models[selectedProvider] ?? [] : [];
  const selectedModelValue = creationModel(availableCatalog, selectedProvider, draft.model);
  const selectedModel = draft.model.trim() || selectedModelValue?.id || "";
  const bundled = !!models.length && !hostCatalog?.models[selectedProvider!]?.length;
  return { selectedProvider, selectedAccountId, models, selectedModelValue, selectedModel, bundled };
}
