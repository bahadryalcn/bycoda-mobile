import {
  CROSS_ADVISOR_KEY,
  CROSS_SUBAGENTS_KEY,
  DELEGATION_LIMITS,
  decodeAdvisor,
  decodeSubagents,
  delegateRefKey,
  encodeAdvisor,
  encodeSubagents,
  type DelegateModelRef,
} from "../../../../src/shared/model/host-contracts/delegation";
import {
  IMAGE_MODEL_IDS,
  IMAGE_MODEL_INFO,
  IMAGE_MODELS_KEY,
  decodeImageModels,
  encodeImageModels,
  type ImageModelId,
} from "../../../../src/shared/model/host-contracts/image-models";
import type { HostModelCatalog, RemoteProvider } from "./wire";
import { accountName, usableAccount } from "./provider-choices";

/**
 * bycoda's own cross-provider delegation as the phone edits it: one advisor, several subagent
 * models and the allowed image models, any provider or account. Mobile mirror of the pure part of
 * src/features/sessions/model/crossDelegation.ts (that module reaches desktop runtime code).
 * The values ride in the session's `modelSettings` under the reserved keys of the shared contracts.
 */
export type DelegateCandidate = {
  ref: DelegateModelRef;
  /** `delegateRefKey` of the ref with the implicit default account made explicit. */
  key: string;
  provider: RemoteProvider;
  /** Model name only; the provider is shown by its mark. */
  name: string;
  /** Account name; absent for providers without accounts. */
  account?: string;
  /** Account identity for grouping; absent for providers without accounts. */
  accountKey?: string;
  /** The provider's default login. */
  defaultAccount?: boolean;
  color?: string;
  kind?: "personal" | "work";
  derivedKind?: "personal" | "work";
  /** "Model · Account", the label desktop shows. */
  label: string;
};

export type ImageChoice = { id: ImageModelId; name: string };

const DEFAULT_ACCOUNT_ID = "default";
const ACCOUNT_PROVIDERS: readonly RemoteProvider[] = ["codex", "claude"];

/** An omitted account of a multi-account provider is the default login. */
export function refKey(ref: DelegateModelRef): string {
  return delegateRefKey(
    ACCOUNT_PROVIDERS.includes(ref.harness as RemoteProvider) && !ref.providerAccountId
      ? { ...ref, providerAccountId: DEFAULT_ACCOUNT_ID }
      : ref,
  );
}

/**
 * Accounts sharing a label stay apart by their id, like the desktop display label. The Host's
 * generic default label ("Host default") reads as the localized default account.
 */
function accountLabel(
  accounts: readonly { id: string; label: string; isDefault?: boolean }[],
  account: { id: string; label: string; isDefault?: boolean },
  defaultLabel: string,
) {
  const name = accountName(account, defaultLabel);
  const key = name.trim().toLocaleLowerCase();
  const shared = accounts.some(
    (other) => other.id !== account.id && accountName(other, defaultLabel).trim().toLocaleLowerCase() === key,
  );
  return shared ? `${name} · ${account.id}` : name;
}

/**
 * Every model the computer offers, one entry per usable account for Claude and Codex. Signed-out
 * and disabled accounts are left out, as in the provider choices; a provider the desktop turned
 * off arrives with no models.
 */
export function delegationCandidates(
  catalog: HostModelCatalog | undefined,
  providers: readonly RemoteProvider[],
  defaultAccountLabel = "Default account",
): DelegateCandidate[] {
  return providers.flatMap((provider) => {
    const offered = ACCOUNT_PROVIDERS.includes(provider)
      ? catalog?.accounts?.[provider as "codex" | "claude"]
      : undefined;
    const accounts = offered?.filter((account) => usableAccount(account, offered)) ?? [];
    // Listed accounts that are all unusable leave the provider without candidates.
    if (offered?.length && !accounts.length) return [];
    return (catalog?.models[provider] ?? []).flatMap((model): DelegateCandidate[] => {
      if (!accounts.length) {
        const ref: DelegateModelRef = { harness: provider, model: model.id };
        return [{ ref, key: refKey(ref), provider, name: model.name, label: model.name }];
      }
      return accounts.map((account) => {
        const account_ = accountLabel(accounts, account, defaultAccountLabel);
        const ref: DelegateModelRef = {
          harness: provider,
          model: model.id,
          providerAccountId: account.id,
        };
        return {
          ref,
          key: refKey(ref),
          provider,
          name: model.name,
          account: account_,
          accountKey: account.id,
          defaultAccount: account.id === DEFAULT_ACCOUNT_ID,
          color: account.color,
          kind: account.kind,
          derivedKind: account.derivedKind,
          label: `${model.name} · ${account_}`,
        };
      });
    });
  });
}

/**
 * Image generators the session may pick: those tied to a connected provider. With the catalogue,
 * only providers that list models count, so a provider turned off on the desktop offers none.
 */
export function imageChoices(
  providers: readonly RemoteProvider[],
  catalog?: HostModelCatalog,
): ImageChoice[] {
  return IMAGE_MODEL_IDS.flatMap((id) => {
    const harness = IMAGE_MODEL_INFO[id].harness;
    const active = !!harness && providers.includes(harness) &&
      (!catalog || !!catalog.models[harness]?.length || !!catalog.pending?.includes(harness));
    return active ? [{ id, name: IMAGE_MODEL_INFO[id].name }] : [];
  });
}

export type Delegation = {
  advisor: DelegateModelRef | undefined;
  subagents: DelegateModelRef[];
  /** Undefined is automatic (every available model); an empty list turns images off. */
  images: ImageModelId[] | undefined;
};

export function readDelegation(settings: Readonly<Record<string, string>>): Delegation {
  return {
    advisor: decodeAdvisor(settings[CROSS_ADVISOR_KEY]),
    subagents: decodeSubagents(settings[CROSS_SUBAGENTS_KEY]),
    images: decodeImageModels(settings[IMAGE_MODELS_KEY]),
  };
}

/** "Off" is an empty value, as on desktop; a ref a model change cannot revive stays off. */
export function setAdvisor(
  settings: Record<string, string>,
  ref: DelegateModelRef | undefined,
): Record<string, string> {
  return { ...settings, [CROSS_ADVISOR_KEY]: encodeAdvisor(ref) ?? "" };
}

/** The models in effect: the explicit list, or every offered one while automatic. */
export function effectiveImages(
  settings: Readonly<Record<string, string>>,
  offered: readonly ImageChoice[],
): ImageModelId[] {
  const picked = decodeImageModels(settings[IMAGE_MODELS_KEY]);
  return picked === undefined ? offered.map((choice) => choice.id) : picked;
}

function withImages(
  settings: Record<string, string>,
  ids: readonly ImageModelId[] | undefined,
): Record<string, string> {
  const { [IMAGE_MODELS_KEY]: _dropped, ...rest } = settings;
  const encoded = encodeImageModels(ids);
  return encoded === undefined ? rest : { ...rest, [IMAGE_MODELS_KEY]: encoded };
}

/** The whole subagent list at once, capped like the Host caps it. */
export function setSubagents(
  settings: Record<string, string>,
  refs: readonly DelegateModelRef[],
): Record<string, string> {
  return {
    ...settings,
    [CROSS_SUBAGENTS_KEY]: encodeSubagents(refs.slice(0, DELEGATION_LIMITS.subagentModels)) ?? "",
  };
}

/** Every offered model picked is the automatic state (no stored list); none picked turns images off. */
export function setImageModels(
  settings: Record<string, string>,
  ids: readonly ImageModelId[],
  offered: readonly ImageChoice[],
): Record<string, string> {
  const all = offered.length > 0 && offered.every((choice) => ids.includes(choice.id));
  return withImages(settings, all ? undefined : ids);
}
