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
const NAMES: Partial<Record<RemoteProvider, string>> = {
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

export function providerName(provider: RemoteProvider): string {
  return NAMES[provider] ?? provider;
}

export function choiceKey(provider: RemoteProvider, accountId?: string): string {
  return `${provider}:${accountId && accountId !== DEFAULT_ACCOUNT_ID ? accountId : ""}`;
}

/**
 * Every provider the computer offers, expanded to one choice per account when the Host lists
 * several (Claude/Codex profiles). The Host's "default" profile maps to no account id.
 */
export function providerChoices(
  providers: readonly RemoteProvider[],
  accounts: HostModelCatalog["accounts"],
  defaultAccountLabel: string,
): ProviderChoice[] {
  return providers.flatMap((provider): ProviderChoice[] => {
    const list = provider === "claude" || provider === "codex" ? (accounts?.[provider] ?? []) : [];
    const name = providerName(provider);
    if (list.length <= 1) {
      return [
        {
          key: choiceKey(provider),
          provider,
          label: name,
          color: list[0]?.color,
          kind: list[0]?.kind,
          derivedKind: list[0]?.derivedKind,
        },
      ];
    }
    return list.map((account) => {
      const isDefault = account.id === DEFAULT_ACCOUNT_ID;
      return {
        key: choiceKey(provider, account.id),
        provider,
        ...(isDefault ? {} : { accountId: account.id }),
        label: isDefault ? defaultAccountLabel : account.label,
        detail: name,
        color: account.color,
        kind: account.kind,
        derivedKind: account.derivedKind,
      };
    });
  });
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
