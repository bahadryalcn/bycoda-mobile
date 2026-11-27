import type { HostModelCatalog, RemoteProvider } from "../wire";
import { choiceKey, providerChoices, selectedChoice, type ProviderChoice } from "../provider-choices";
import { modelDefaults } from "../catalog";
import type { AgentModel } from "../../../../../src/features/sessions/model/models";

/** A fixed model as work items store it. */
export type FixedModel = {
  harness: RemoteProvider;
  providerAccountId?: string;
  model: string;
  modelSettings?: Record<string, string>;
};

/**
 * Inputs of the shared model picker for one stored fixed model: every provider account the
 * computer offers, the saved one (kept visible even when its account disappeared) and its models.
 */
export function fixedModelChoices(
  value: FixedModel,
  providers: readonly RemoteProvider[],
  catalog: HostModelCatalog | undefined,
  defaultAccountLabel: string,
  unavailableLabel: string,
): { choices: ProviderChoice[]; choice: ProviderChoice | undefined; unavailableAccount: boolean; models: AgentModel[] } {
  const all = [...new Set([value.harness, ...providers])];
  const choices = providerChoices(all, catalog?.accounts, defaultAccountLabel);
  const saved = choices.find((entry) => entry.key === choiceKey(value.harness, value.providerAccountId));
  const unavailableAccount =
    (value.harness === "claude" || value.harness === "codex") &&
    Array.isArray(catalog?.accounts?.[value.harness]) &&
    !saved;
  const choice = unavailableAccount
    ? { key: choiceKey(value.harness, value.providerAccountId), provider: value.harness, label: unavailableLabel }
    : (saved ?? selectedChoice(choices, value.harness, value.providerAccountId));
  return { choices, choice, unavailableAccount, models: catalog?.models[value.harness] ?? [] };
}

/** Another provider or account from the picker: the account changes, and a new provider starts on its first model. */
export function chooseFixedProvider<T extends FixedModel>(
  value: T,
  next: ProviderChoice,
  catalog: HostModelCatalog | undefined,
): T {
  if (next.provider === value.harness)
    return { ...value, providerAccountId: next.accountId };
  const first = catalog?.models[next.provider]?.[0];
  return {
    ...value,
    harness: next.provider,
    providerAccountId: next.accountId,
    model: first?.id ?? "",
    modelSettings: first ? modelDefaults(first) : {},
  };
}

/** A model picked under any provider account, with the settings the picker carried over. */
export function chooseFixedModel<T extends FixedModel>(
  value: T,
  next: ProviderChoice,
  model: string,
  modelSettings: Record<string, string>,
): T {
  return { ...value, harness: next.provider, providerAccountId: next.accountId, model, modelSettings };
}
