import type { AgentModel } from "../../../../src/features/sessions/model/models";
import { groupedSettings, isPrimarySetting, settingLabel } from "./agent-model-settings";

export type ModelRow = { value: string; label: string; detail?: string; selected: boolean };

/** "200K" / "1M" for a context window; undefined when the catalog does not report one. */
export function contextLabel(tokens: number | undefined): string | undefined {
  if (!tokens || !Number.isFinite(tokens) || tokens <= 0) return undefined;
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`.replace(".0M", "M");
  return `${Math.round(tokens / 1000)}K`;
}

/** The id is a second line only when it adds something; the context window joins it. */
export function modelDetail(model: AgentModel, contextSuffix: string): string | undefined {
  const id = model.nativeId || model.id;
  const named = model.name.trim().toLowerCase() === id.trim().toLowerCase() ? undefined : id;
  const context = contextLabel(model.contextWindow);
  return [named, context ? `${context} ${contextSuffix}` : undefined].filter(Boolean).join(" · ") || undefined;
}

/** One row per catalog model; a saved custom id missing from the catalog is kept first. */
export function modelRows(models: readonly AgentModel[], current: string, contextSuffix: string): ModelRow[] {
  const selected = models.find((entry) => entry.id === current || entry.nativeId === current);
  const rows = models.map((entry) => ({
    value: entry.id,
    label: entry.name,
    detail: modelDetail(entry, contextSuffix),
    selected: entry === selected,
  }));
  return current && !selected ? [{ value: current, label: current, detail: undefined, selected: true }, ...rows] : rows;
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
