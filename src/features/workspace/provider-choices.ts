import type { HostModelCatalog, RemoteProvider } from "./wire";

/** One selectable agent provider on the target computer, optionally bound to a named account. */
export type ProviderChoice = {
  key: string;
  provider: RemoteProvider;
  /** Absent for the provider's default login and for providers without accounts. */
  accountId?: string;
  /** Account name, or the provider name when the provider has a single login. */
  label: string;
  /** Provider name shown as the secondary line when the label is an account name. */
  detail?: string;
  /** Account colour from the Host; absent for providers without accounts. */
  color?: string;
  kind?: "personal" | "work";
  derivedKind?: "personal" | "work";
};

const DEFAULT_ACCOUNT_ID = "default";
/** Generic names the Host gives its default login ("Host default"); never shown as an account name. */
const GENERIC_DEFAULT = /^(host default|host default account|default account|default)$/i;

/** An account's display name; the Host's generic default label becomes the localized default name. */
export function accountName(
  account: { id: string; label: string; isDefault?: boolean },
  defaultLabel: string,
): string {
  const label = account.label.trim();
  return (account.id === DEFAULT_ACCOUNT_ID || account.isDefault === true) && (!label || GENERIC_DEFAULT.test(label))
    ? defaultLabel
    : label || account.id;
}

const NAMES: Readonly<Record<string, string>> = {
  codex: "Codex",
  claude: "Claude",
  cursor: "Cursor",
  grok: "Grok",
  opencode: "OpenCode",
  pi: "Pi",
  omp: "OMP",
  fx: "FX",
  hermes: "Hermes",
  antigravity: "Antigravity",
  acp: "ACP",
};

/** Display only: preserve unknown/custom IDs without changing their routing identity. */
export function providerName(provider: string): string {
  return Object.hasOwn(NAMES, provider) ? NAMES[provider]! : provider;
}

export function choiceKey(provider: RemoteProvider, accountId?: string): string {
  return `${provider}:${accountId && accountId !== DEFAULT_ACCOUNT_ID ? accountId : ""}`;
}

/**
 * Every provider the computer offers, expanded to one choice per account when the Host lists
 * accounts (Claude/Codex profiles). The Host's "default" profile maps to no account id.
 */
export function providerChoices(
  providers: readonly RemoteProvider[],
  accounts: HostModelCatalog["accounts"],
  defaultAccountLabel: string,
): ProviderChoice[] {
  return providers.flatMap((provider): ProviderChoice[] => {
    const offered = offeredAccounts(provider, accounts);
    const list = offered?.filter((account) => usableAccount(account, offered)) ?? [];
    const name = providerName(provider);
    if (list.length === 0) {
      if (offered) return [];
      return [
        {
          key: choiceKey(provider),
          provider,
          label: name,
        },
      ];
    }
    return list.map((account) => {
      const isDefault = account.id === DEFAULT_ACCOUNT_ID;
      return {
        key: choiceKey(provider, account.id),
        provider,
        ...(isDefault ? {} : { accountId: account.id }),
        label: accountName(account, defaultAccountLabel),
        detail: name,
        color: account.color,
        kind: account.kind,
        derivedKind: account.derivedKind,
      };
    });
  });
}

type CatalogAccount = NonNullable<NonNullable<HostModelCatalog["accounts"]>["claude"]>[number];

/** The accounts the Host lists for a provider whose logins mobile can choose (Claude/Codex profiles). */
function offeredAccounts(provider: RemoteProvider, accounts: HostModelCatalog["accounts"]) {
  return provider === "claude" || provider === "codex" ? accounts?.[provider] : undefined;
}

/**
 * Ready accounts, plus the default login while its state is unknown. The Host always lists its own
 * profile as "default"; once the desktop names another account its default, that profile is not one
 * of the desktop's accounts and is left out, as on the desktop.
 */
export function usableAccount(account: CatalogAccount, offered: readonly CatalogAccount[]): boolean {
  if (
    account.id === DEFAULT_ACCOUNT_ID && account.isDefault !== true &&
    offered.some((entry) => entry.id !== DEFAULT_ACCOUNT_ID && entry.isDefault === true)
  ) return false;
  return account.status === undefined || account.status === "ready" ||
    (account.status === "unknown" && (account.isDefault === true ||
      (account.id === DEFAULT_ACCOUNT_ID && !offered.some((entry) => entry.isDefault))));
}

/** An account the Host lists but cannot use now; pickers show it disabled with the reason. */
export type UnavailableProviderChoice = ProviderChoice & { status: "signed-out" | "disabled" };

/**
 * Signed-out and disabled accounts of the offered providers. They never become choices (and never
 * a new session's default); they only explain why an account is missing from the choices.
 */
export function unavailableProviderChoices(
  providers: readonly RemoteProvider[],
  accounts: HostModelCatalog["accounts"],
  defaultAccountLabel: string,
): UnavailableProviderChoice[] {
  return providers.flatMap((provider) =>
    (offeredAccounts(provider, accounts) ?? []).flatMap((account): UnavailableProviderChoice[] => {
      if (account.status !== "signed-out" && account.status !== "disabled") return [];
      const isDefault = account.id === DEFAULT_ACCOUNT_ID;
      return [{
        key: choiceKey(provider, account.id),
        provider,
        ...(isDefault ? {} : { accountId: account.id }),
        label: accountName(account, defaultAccountLabel),
        detail: providerName(provider),
        ...(account.color ? { color: account.color } : {}),
        status: account.status,
      }];
    }),
  );
}

/** The choice for a saved provider/account pair; falls back to the provider's first choice. */
export function selectedChoice(
  choices: readonly ProviderChoice[],
  provider: RemoteProvider | undefined,
  accountId: string | undefined,
): ProviderChoice | undefined {
  return (
    choices.find((choice) => choice.key === (provider ? choiceKey(provider, accountId) : "")) ??
    choices.find((choice) => choice.provider === provider) ??
    choices[0]
  );
}
