import type { AgentModel } from "../../../../src/features/sessions/model/models";
import { groupedSettings, isPrimarySetting, settingLabel } from "./agent-model-settings";
import { groupModels, type ModelGroupSection } from "./model-groups";
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
  name: string;
  searchKeywords?: string;
  selected: boolean;
};

/**
 * The picker's grouped list: every provider account the computer offers, in product order, with
 * the models of that provider. The current account shows its live list (a saved custom id first);
 * the others come from the computer's catalog. A search filters within the sections.
 */
export function pickerSections(
  choices: readonly ProviderChoice[],
  current: ProviderChoice | undefined,
  models: readonly AgentModel[],
  model: string,
  catalogModels: Partial<Record<string, readonly AgentModel[]>> | undefined,
  search = "",
  locale?: string,
): ModelGroupSection<PickerModelItem>[] {
  const all = current && !choices.some((item) => item.key === current.key) ? [current, ...choices] : choices;
  const items = all.flatMap((choice): PickerModelItem[] => {
    const own = choice.key === current?.key;
    const rows = own ? modelRows(models, model) : modelRows(catalogModels?.[choice.provider] ?? [], "");
    const account = choice.label !== providerName(choice.provider) ? choice.label : undefined;
    return rows.map((row) => ({
      value: `${choice.key}\u0000${row.value}`,
      choice,
      model: row.value,
      provider: choice.provider,
      accountKey: choice.key,
      ...(account ? { account } : {}),
      ...(account && !choice.accountId ? { defaultAccount: true } : {}),
      name: row.label,
      searchKeywords: row.searchKeywords,
      selected: own && row.selected,
    }));
  });
  const sections = groupModels(items);
  if (!search.trim()) return sections;
  return sections
    .map((section) => {
      const rows = section.rows.filter(({ item, family, label }) =>
        filterSelection([{ value: item.value, label, group: section.title, subgroup: family, searchKeywords: item.searchKeywords }], search, locale).length > 0);
      return { ...section, rows };
    })
    .filter((section) => section.rows.length > 0);
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
