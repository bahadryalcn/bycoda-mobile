import { providerName } from "./provider-choices";
export { accountName } from "./provider-choices";
import type { RemoteProvider } from "./wire";
import { effortVariant } from "./model-variants";

/**
 * One grouping for every model list in the composer: the model picker and the subagent/advisor
 * pickers show the same provider order, the same account sections and the same effort families.
 */

/** Product order of agents; providers the list does not name follow in their own order. */
export const PROVIDER_ORDER: readonly string[] = [
  "claude", "codex", "opencode", "antigravity", "cursor", "grok", "pi", "omp", "hermes", "fx", "acp",
];

export function providerRank(provider: string): number {
  const index = PROVIDER_ORDER.indexOf(provider);
  return index < 0 ? PROVIDER_ORDER.length : index;
}

/**
 * "Gemini 4 Hydrogen (High)" → family "Gemini 4 Hydrogen", variant "High". Only an effort suffix
 * is a variant: "Gemini Solo (Preview)" is the whole model name.
 */
export function modelVariant(name: string): { family: string; variant?: string } {
  return effortVariant(name) ?? { family: name.trim() };
}

export type GroupableModel = {
  provider: RemoteProvider;
  /** Identity of the account section; absent for providers without accounts. */
  accountKey?: string;
  /** Display name of the account. */
  account?: string;
  /** The default login leads its provider's sections. */
  defaultAccount?: boolean;
  name: string;
};

export type ModelGroupRow<T> = {
  item: T;
  /** Row text: the effort variant inside a family, otherwise the model name. */
  label: string;
  /** Shared model name when two or more effort variants of it sit in the section. */
  family?: string;
};

export type ModelGroupSection<T> = {
  key: string;
  provider: RemoteProvider;
  account?: string;
  /** "Claude · Work", or just "Claude" for a provider without accounts. */
  title: string;
  rows: ModelGroupRow<T>[];
};

/**
 * Sections by provider (product order) and then account (default login first, otherwise the
 * Host's order). Models keep the Host's order, which lists the most capable first; effort variants
 * of one model sit together under their shared name.
 */
export function groupModels<T extends GroupableModel>(items: readonly T[]): ModelGroupSection<T>[] {
  const sections = new Map<string, { section: ModelGroupSection<T>; order: number; items: T[] }>();
  items.forEach((item, index) => {
    const key = `${item.provider}\u0000${item.accountKey ?? ""}`;
    let entry = sections.get(key);
    if (!entry) {
      const name = providerName(item.provider);
      entry = {
        section: {
          key,
          provider: item.provider,
          ...(item.account ? { account: item.account } : {}),
          title: item.account ? `${name} · ${item.account}` : name,
          rows: [],
        },
        // Default login first within its provider, then first appearance.
        order: item.defaultAccount ? -1 : index,
        items: [],
      };
      sections.set(key, entry);
    }
    if (item.defaultAccount) entry.order = -1;
    if (item.account && !entry.section.account) {
      entry.section.account = item.account;
      entry.section.title = `${providerName(item.provider)} · ${item.account}`;
    }
    entry.items.push(item);
  });
  return [...sections.values()]
    .sort((a, b) =>
      providerRank(a.section.provider) - providerRank(b.section.provider) ||
      a.section.provider.localeCompare(b.section.provider) ||
      a.order - b.order)
    .map(({ section, items: members }) => ({ ...section, rows: familyRows(members) }));
}

function familyRows<T extends GroupableModel>(items: readonly T[]): ModelGroupRow<T>[] {
  const families = new Map<string, T[]>();
  for (const item of items) {
    const { family, variant } = modelVariant(item.name);
    const key = variant ? family.toLocaleLowerCase() : `\u0000${item.name}\u0000${families.size}`;
    families.set(key, [...(families.get(key) ?? []), item]);
  }
  return [...families.values()].flatMap((members) => {
    if (members.length < 2) return members.map((item) => ({ item, label: item.name }));
    const family = modelVariant(members[0]!.name).family;
    return members.map((item) => ({ item, label: modelVariant(item.name).variant!, family }));
  });
}

/** Select options for the advisor and subagent pickers: one heading per provider account, effort variants under their model. */
export function delegationOptions<T extends GroupableModel & { key: string; label: string }>(items: readonly T[]) {
  return groupModels(items).flatMap((section) =>
    section.rows.map(({ item, label, family }) => ({
      item,
      value: item.key,
      label,
      group: section.title,
      ...(family ? { subgroup: family } : {}),
      // The closed field lists the whole name: "Opus 5.5 · Work".
      summaryLabel: item.label,
      searchKeywords: [item.name, item.account, item.provider].filter(Boolean).join(" "),
    })),
  );
}
