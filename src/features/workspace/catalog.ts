import { REMOTE_PROVIDERS } from "../../../../src/features/connections/model/protocol";
import type { HostModelCatalog, RemoteProvider } from "./wire";

/** Older saved connections may lack a descriptor; infer only providers returned by the host. */
export function catalogProviders(
  advertised: readonly RemoteProvider[] | undefined,
  catalog?: HostModelCatalog,
): RemoteProvider[] {
  const providers = advertised?.length
    ? advertised
    : REMOTE_PROVIDERS.filter(
        (provider) =>
          Object.prototype.hasOwnProperty.call(catalog?.models ?? {}, provider) ||
          Object.prototype.hasOwnProperty.call(catalog?.errors ?? {}, provider),
      );
  return [...new Set(providers)].filter((provider) => REMOTE_PROVIDERS.includes(provider));
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

export function modelDefaults(model: ReturnType<typeof catalogModel>): Record<string, string> {
  return Object.fromEntries((model?.settings ?? []).map((setting) => [setting.id, setting.value]));
}
