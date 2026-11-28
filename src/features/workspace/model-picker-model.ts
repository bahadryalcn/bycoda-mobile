import type { AgentModel, ModelSetting } from "../../../../src/features/sessions/model/models";
import { groupedSettings, isPrimarySetting, settingLabel } from "./agent-model-settings";
import { groupModels, providerRank } from "./model-groups";
import { foldVariants, upstreamOf, type FoldedVariant } from "./model-variants";
import { providerName, type ProviderChoice } from "./provider-choices";
import { filterSelection } from "@/ui/selection-model";

type ModelRow = { value: string; label: string; searchKeywords?: string; selected: boolean };

/** One row per catalog model; a saved custom id missing from the catalog is kept first. */
export function modelRows(models: readonly AgentModel[], current: string): ModelRow[] {
  const selected = models.find((entry) => entry.id === current || entry.nativeId === current);
  const rows = models.map((entry) => ({
    value: entry.id,
    label: entry.name || entry.id,
    searchKeywords: [entry.id, entry.nativeId].filter(Boolean).join(" "),
    selected: entry === selected,
  }));
  return current && !selected ? [{ value: current, label: current, selected: true }, ...rows] : rows;
}

export type PickerModelItem = {
  /** Unique across sections: the account choice and the model id. */
  value: string;
  choice: ProviderChoice;
  model: string;
  provider: ProviderChoice["provider"];
  accountKey: string;
  account?: string;
  defaultAccount?: boolean;
  /** Catalogue name, e.g. "Anthropic · claude-opus-4-8" or "Gemini 4 Hydrogen (High)". */
  name: string;
  searchKeywords?: string;
  selected: boolean;
};

/** One row of the list: a model, or one model whose effort variants fold into the Reasoning control. */
export type PickerEntry = {
  key: string;
  /** The selected variant when it is in use, otherwise the model (or first variant) a tap opens. */
  item: PickerModelItem;
  label: string;
  variants?: FoldedVariant<PickerModelItem>[];
  selected: boolean;
  /** Full names and raw ids of the row's models, so a search for either finds it. */
  searchKeywords: string;
};

/** Models of one upstream vendor (Hermes, OpenCode); other providers have one untitled group. */
export type PickerGroup = { key: string; title?: string; entries: PickerEntry[]; selected: boolean };

export type PickerAccount = {
  key: string;
  choice: ProviderChoice;
  /** The account name, or the provider name for a single login. */
  label: string;
  /** "Claude · Work", or "Claude" for a provider without accounts. */
  title: string;
  /** The session's current account. */
  own: boolean;
  groups: PickerGroup[];
};

export type PickerProvider = { provider: ProviderChoice["provider"]; title: string; accounts: PickerAccount[] };

/**
 * The picker's catalogue: every provider the computer offers in product order, each with its
 * accounts (default login first) and their models in the Host's order. The current account shows
 * its live list (a saved custom id first); the others come from the computer's catalog. Effort
 * variants fold into one row and multi-vendor providers group their models by upstream vendor.
 */
export function pickerProviders(
  choices: readonly ProviderChoice[],
  current: ProviderChoice | undefined,
  models: readonly AgentModel[],
  model: string,
  catalogModels: Partial<Record<string, readonly AgentModel[]>> | undefined,
): PickerProvider[] {
  const all = current && !choices.some((item) => item.key === current.key) ? [current, ...choices] : choices;
  const meta = new Map<string, ItemMeta>();
  const items = all.flatMap((choice): PickerModelItem[] => {
    const own = choice.key === current?.key;
    const list = own ? models : catalogModels?.[choice.provider] ?? [];
    const rows = modelRows(list, own ? model : "");
    const account = choice.label !== providerName(choice.provider) ? choice.label : undefined;
    return rows.map((row) => {
      const value = `${choice.key}\u0000${row.value}`;
      const source = list.find((entry) => entry.id === row.value);
      const upstream = upstreamOf(choice.provider, row.label, source?.provider);
      meta.set(value, {
        ...(upstream.group ? { upstream: upstream.group } : {}),
        label: upstream.label,
        keywords: [row.label, row.searchKeywords].filter(Boolean).join(" "),
      });
      return {
        value,
        choice,
        model: row.value,
        provider: choice.provider,
        accountKey: choice.key,
        ...(account ? { account } : {}),
        ...(account && !choice.accountId ? { defaultAccount: true } : {}),
        name: row.label,
        searchKeywords: row.searchKeywords,
        selected: own && row.selected,
      };
    });
  });
  const providers: PickerProvider[] = [];
  for (const section of groupModels(items)) {
    const members = section.rows.map((row) => row.item);
    const head = members[0]!.choice;
    let entry = providers.find((item) => item.provider === section.provider);
    if (!entry) {
      entry = { provider: section.provider, title: providerName(section.provider), accounts: [] };
      providers.push(entry);
    }
    entry.accounts.push({
      key: head.key,
      choice: head,
      label: section.account ?? providerName(section.provider),
      title: section.title,
      own: head.key === current?.key,
      groups: upstreamGroups(members, meta),
    });
  }
  // The session's provider stays browsable while its list is empty (loading, unreadable), so the
  // picker opens on it with an honest empty state instead of on another provider.
  for (const choice of all) {
    if (choice.provider !== current?.provider) continue;
    let entry = providers.find((item) => item.provider === choice.provider);
    if (!entry) {
      entry = { provider: choice.provider, title: providerName(choice.provider), accounts: [] };
      providers.push(entry);
    }
    if (entry.accounts.some((account) => account.key === choice.key)) continue;
    const account = choice.label !== providerName(choice.provider) ? choice.label : undefined;
    entry.accounts.push({
      key: choice.key,
      choice,
      label: account ?? providerName(choice.provider),
      title: account ? `${providerName(choice.provider)} · ${account}` : providerName(choice.provider),
      own: choice.key === current?.key,
      groups: [],
    });
  }
  return providers.sort((a, b) => providerRank(a.provider) - providerRank(b.provider) || a.provider.localeCompare(b.provider));
}

type ItemMeta = { upstream?: string; label: string; keywords: string };

function upstreamGroups(members: readonly PickerModelItem[], meta: ReadonlyMap<string, ItemMeta>): PickerGroup[] {
  const titles = new Set(members.map((item) => meta.get(item.value)?.upstream).filter(Boolean));
  // A single vendor is no grouping: its rows keep their full names.
  const grouped = titles.size >= 2;
  const buckets = new Map<string, PickerModelItem[]>();
  for (const item of members) {
    const title = grouped ? meta.get(item.value)?.upstream ?? "" : "";
    buckets.set(title, [...(buckets.get(title) ?? []), item]);
  }
  return [...buckets.entries()].map(([title, bucket]) => {
    const nameOf = (item: PickerModelItem) => (grouped ? meta.get(item.value)?.label ?? item.name : item.name);
    const entries = foldVariants(bucket, nameOf).map((row): PickerEntry => {
      const family = row.variants ? row.variants.map((variant) => variant.item) : [row.item];
      const selected = family.find((item) => item.selected);
      return {
        key: row.item.value,
        item: selected ?? row.item,
        label: row.label,
        ...(row.variants ? { variants: row.variants } : {}),
        selected: !!selected,
        searchKeywords: [title, ...family.map((item) => meta.get(item.value)?.keywords ?? item.name)]
          .filter(Boolean).join(" "),
      };
    });
    return { key: title || "\u0000", ...(title ? { title } : {}), entries, selected: entries.some((item) => item.selected) };
  });
}

export type PickerSearchSection = { key: string; account: PickerAccount; groups: PickerGroup[] };

/** A search across every provider and account; results stay under their provider and account headings. */
export function searchPicker(
  providers: readonly PickerProvider[],
  search: string,
  locale?: string,
): PickerSearchSection[] {
  if (!search.trim()) return [];
  return providers.flatMap((provider) =>
    provider.accounts.flatMap((account) => {
      const groups = account.groups
        .map((group) => ({
          ...group,
          entries: group.entries.filter((entry) =>
            filterSelection(
              [{ value: entry.key, label: entry.label, group: account.title, subgroup: group.title, searchKeywords: entry.searchKeywords }],
              search,
              locale,
            ).length > 0),
        }))
        .filter((group) => group.entries.length > 0);
      return groups.length ? [{ key: account.key, account, groups }] : [];
    }),
  );
}

/**
 * How many different models the picker offers: one per provider and model, however many accounts
 * list it. Decides whether the list needs a search field.
 */
export function distinctModelCount(providers: readonly PickerProvider[]): number {
  const seen = new Set<string>();
  for (const provider of providers)
    for (const account of provider.accounts)
      for (const group of account.groups)
        for (const entry of group.entries) seen.add(JSON.stringify([provider.provider, group.key, entry.label]));
  return seen.size;
}

/** The row of an account's list that holds a model id, directly or as one of its effort variants. */
export function entryFor(account: PickerAccount | undefined, model: string): PickerEntry | undefined {
  if (!model) return undefined;
  return account?.groups.flatMap((group) => group.entries).find((entry) =>
    entry.item.model === model || !!entry.variants?.some((variant) => variant.item.model === model));
}

/** The selected row of an account's list. */
export function selectedEntry(account: PickerAccount | undefined): PickerEntry | undefined {
  return account?.groups.flatMap((group) => group.entries).find((entry) => entry.selected);
}

/**
 * The Reasoning control of a model whose efforts are separate catalogue entries: one option per
 * variant (the value is the variant's model id), lowest effort first. Undefined for other rows.
 * When the model also has its own Reasoning setting, the variants read as a separate "Variant"
 * control so both stay reachable.
 */
export function variantSetting(entry: PickerEntry | undefined, nativeReasoning = false): ModelSetting | undefined {
  if (!entry?.variants) return undefined;
  return {
    id: nativeReasoning ? "variant" : "reasoning",
    label: nativeReasoning ? "Variant" : "Reasoning",
    kind: "select",
    value: entry.item.model,
    options: entry.variants.map((variant) => ({ value: variant.item.model, label: variant.label })),
  };
}

/** Reasoning first, then the speed and thinking toggles: the settings shown inline in the picker. */
export function inlineSettings(model: AgentModel | undefined) {
  return groupedSettings(model).model.filter(isPrimarySetting)
    .sort((a, b) => Number(settingLabel(a) !== "Reasoning") - Number(settingLabel(b) !== "Reasoning"));
}

/** "Low · Fast" style summary of the inline settings; a default, standard or off value is left out. */
export function settingsSummary(
  model: AgentModel | undefined,
  values: Record<string, string>,
  labels: Record<string, string>,
): string {
  return inlineSettings(model).flatMap((setting) => {
    const current = values[setting.id] ?? setting.value;
    const option = setting.options.find((item) => item.value === current);
    if (!option) return [];
    const sides = toggleSides(setting);
    if (sides) {
      // The fast tier always reads "Fast", whatever the provider calls the setting ("Service Tier").
      const name = FAST_SETTING.test(setting.id) ? "Fast" : settingLabel(setting);
      return option === sides.on ? [labels[name] ?? name] : [];
    }
    if (current === "" || RESTING_LABEL.test(option.label)) return [];
    return [labels[option.label] ?? option.label];
  }).join(" · ");
}

const RESTING_LABEL = /^(standard|default|off|none|normal)$/i;
/** Settings that switch the provider's fast or priority service tier (FAST_IDS in agent-model-settings). */
const FAST_SETTING = /^(fast|serviceTier)$/;

type Choice = { value: string; label: string };
type ControlSetting = { id: string; options: readonly Choice[] };

/**
 * The on and off sides of a two-option setting that reads as a switch: on/off labels, or the
 * fast / service-tier setting (on is the fast value, off is the standard one). Undefined otherwise.
 */
export function toggleSides(setting: ControlSetting): { on: Choice; off: Choice } | undefined {
  const { options } = setting;
  if (options.length !== 2) return undefined;
  const onOff = options.every((option) => /^(on|off)$/i.test(option.label));
  if (!onOff && !FAST_SETTING.test(setting.id)) return undefined;
  const on = options.find((option) => /^(on|fast|enabled|priority)$/i.test(option.label))
    ?? options.find((option) => !RESTING_LABEL.test(option.label)) ?? options[1]!;
  return { on, off: options.find((option) => option !== on)! };
}

/** Which control fits a setting: a switch for on/off and fast, a stepped bar for the reasoning scale, segments for up to three choices, an inline select for longer lists. */
export type SettingControl = "toggle" | "slider" | "segments" | "select";
export function settingControl(setting: ControlSetting): SettingControl {
  const { options } = setting;
  if (toggleSides(setting)) return "toggle";
  // Only reasoning effort is a real low-to-high scale; other long lists are unordered names.
  if (options.length >= 4 && settingLabel(setting as never) === "Reasoning") return "slider";
  return options.length <= 3 ? "segments" : "select";
}

/** The model's Reasoning setting, the one an effort label is carried between. */
function reasoningSetting(model: AgentModel | undefined) {
  return inlineSettings(model).find((item) => settingLabel(item) === "Reasoning");
}

/** The English label of the model's reasoning effort in use (chosen, or the model's default). */
export function reasoningLabel(model: AgentModel | undefined, settings: Record<string, string>): string | undefined {
  const setting = reasoningSetting(model);
  if (!setting) return undefined;
  const value = settings[setting.id] || setting.value;
  return setting.options.find((option) => option.value === value)?.label;
}

/** True when the owner chose the reasoning effort; a sparse form leaves an unchosen one unset. */
export function reasoningChosen(model: AgentModel | undefined, settings: Record<string, string>): boolean {
  const setting = reasoningSetting(model);
  return !!setting && !!settings[setting.id];
}

/**
 * Another model keeps the effort in use: when it offers a reasoning effort with the same label
 * ("High"), that value replaces the one `settings` starts from. Otherwise `settings` is unchanged.
 */
export function carryReasoning(
  next: AgentModel | undefined,
  settings: Record<string, string>,
  effort: string | undefined,
): Record<string, string> {
  if (!effort) return settings;
  const setting = reasoningSetting(next);
  const wanted = effort.trim().toLocaleLowerCase();
  const option = setting?.options.find((item) => item.label.trim().toLocaleLowerCase() === wanted);
  return setting && option ? { ...settings, [setting.id]: option.value } : settings;
}
