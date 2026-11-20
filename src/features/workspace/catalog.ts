import { REMOTE_PROVIDERS } from "../../../../src/features/connections/model/protocol";
import { productProviderDefaults } from "../../../../src/shared/model/productProviderDefaults";
import type { HostModelCatalog, RemoteProvider } from "./wire";
import { providerName } from "./provider-choices";
import { BUNDLED_CLAUDE_MODELS, CODEX_MODEL_CATALOG } from "./bundled-models";

/** Local choices remain usable during discovery; Host options always win. */
export function sessionCatalog(catalog: HostModelCatalog | undefined, providers: readonly RemoteProvider[]): HostModelCatalog {
  const models = { ...catalog?.models };
  for (const provider of providers) {
    if (models[provider]?.length) {
      const bundled = provider === "codex" ? CODEX_MODEL_CATALOG : provider === "claude" ? BUNDLED_CLAUDE_MODELS : [];
      models[provider] = models[provider]!.map((model) => {
        // Old Hosts can omit settings. An explicit empty array still means none.
        if (model.settings !== undefined) return model;
        const known = bundled.find((entry) => entry.id === model.id || (!!model.nativeId && entry.nativeId === model.nativeId));
        return known ? { ...model, settings: known.settings } : model;
      });
      continue;
    }
    if (provider === "codex") models.codex = CODEX_MODEL_CATALOG;
    if (provider === "claude") models.claude = BUNDLED_CLAUDE_MODELS;
  }
  return { ...catalog, models, errors: catalog?.errors ?? {} };
}

/** Human-readable queue identity; original model targets remain untouched. */
export function sessionModelLabel(target?: { harness: RemoteProvider; model: string }): string {
  if (!target) return "";
  return [providerName(target.harness), sessionModelName(target)].filter(Boolean).join(" · ");
}

export function sessionModelName(target: { harness: RemoteProvider; model: string }): string {
  const model = sessionModel(sessionCatalog(undefined, [target.harness]), target.harness, target.model);
  const prefix = `${target.harness}:`;
  return model?.name ?? (target.model.startsWith(prefix) ? target.model.slice(prefix.length) : target.model);
}

/** Custom IDs must never inherit another model's settings. */
export function sessionModel(catalog: HostModelCatalog | undefined, provider: RemoteProvider | undefined, requested: string) {
  const models = provider ? catalog?.models[provider] ?? [] : [];
  return requested.trim()
    ? models.find((model) => model.id === requested || model.nativeId === requested)
    : models[0];
}

export function sessionSettings(model: ReturnType<typeof sessionModel>, values: Record<string, string>): Record<string, string> {
  if (!model) return {};
  return carryReserved(values, Object.fromEntries((model.settings ?? []).map((setting) => [setting.id,
    setting.options.some((option) => option.value === values[setting.id]) ? values[setting.id] : setting.value,
  ])));
}

/** bycoda's own delegation choices ride in modelSettings under reserved keys the model never declares. */
const RESERVED_KEYS = ["crossAdvisor", "crossSubagents", "imageModels", "delegationParent"] as const;
function carryReserved(from: Record<string, string>, into: Record<string, string>): Record<string, string> {
  for (const key of RESERVED_KEYS) if (from[key] !== undefined) into[key] = from[key];
  return into;
}

/** New sessions use product defaults; explicit model IDs and setting choices win. */
export function creationModel(catalog: HostModelCatalog | undefined, provider: RemoteProvider | undefined, requested: string) {
  if (requested.trim() || !provider) return sessionModel(catalog, provider, requested);
  const models = catalog?.models[provider] ?? [];
  const preferred = productProviderDefaults(provider, models).model;
  return models.find((model) => model.id === preferred);
}

export function creationSettings(model: ReturnType<typeof sessionModel>, values: Record<string, string>, provider?: RemoteProvider, models: NonNullable<HostModelCatalog["models"][RemoteProvider]> = []): Record<string, string> {
  const explicit = Object.fromEntries((model?.settings ?? []).flatMap((setting) => {
    const value = values[setting.id];
    return value !== undefined && setting.options.some((option) => option.value === value)
      ? [[setting.id, value]] : [];
  }));
  const result = { ...(provider ? productProviderDefaults(provider, models).extras : {}), ...explicit };
  if (explicit.advisor !== undefined) result.crossAdvisor = explicit.advisor === "off" ? "null" : "";
  if (explicit.subagentModel !== undefined || explicit.subagentPolicy !== undefined) {
    result.crossSubagents = explicit.subagentModel === "off" || explicit.subagentPolicy === "off" ? "[]" : "";
  }
  // An explicit cross-provider choice wins over the value derived from the provider's own setting.
  return carryReserved(values, result);
}

/**
 * Providers the computer offers: its descriptor list plus every provider the live catalog reports.
 * The saved descriptor can be stale (taken at pairing, or before a CLI was installed), so the
 * catalog never loses a provider the Host can serve now.
 */
export function catalogProviders(
  advertised: readonly RemoteProvider[] | undefined,
  catalog?: HostModelCatalog,
): RemoteProvider[] {
  const listed = REMOTE_PROVIDERS.filter(
    (provider) =>
      Object.prototype.hasOwnProperty.call(catalog?.models ?? {}, provider) ||
      Object.prototype.hasOwnProperty.call(catalog?.errors ?? {}, provider) ||
      !!catalog?.pending?.includes(provider),
  );
  return [...new Set([...(advertised ?? []), ...listed])].filter((provider) =>
    REMOTE_PROVIDERS.includes(provider),
  );
}

export function catalogModel(
  catalog: HostModelCatalog | undefined,
  provider: RemoteProvider | undefined,
  requested: string,
) {
  const models = provider ? (catalog?.models[provider] ?? []) : [];
  return models.find((model) => model.id === requested) ?? models[0];
}

/** First-time creation should start on a usable provider; explicit choices stay visible even on error. */
export function catalogProvider(
  providers: readonly RemoteProvider[], catalog: HostModelCatalog | undefined, requested?: RemoteProvider,
): RemoteProvider | undefined {
  return requested && providers.includes(requested) ? requested
    : providers.find((provider) => !!catalog?.models[provider]?.length) ?? providers[0];
}

export function modelDefaults(model: ReturnType<typeof sessionModel>): Record<string, string> {
  return Object.fromEntries((model?.settings ?? []).map((setting) => [setting.id, setting.value]));
}
