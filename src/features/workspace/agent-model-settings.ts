import type { AgentModel, ModelSetting } from "../../../../src/features/sessions/model/models";

/**
 * Mobile mirror of the desktop picker contract in
 * src/features/sessions/model/modelPickerData.ts (that module reaches desktop runtime code, so
 * mobile cannot import it). agent-model-settings.test.ts compares both on the real catalogs;
 * change the two together.
 *
 * Order: Model, Reasoning, Fast, remaining model options, then the Context group and the
 * Advisor/subagent group. The order never depends on usage.
 */
const SETTING_ORDER = [
  "effort",
  "reasoning",
  "reasoningEffort",
  "fast",
  "serviceTier",
  "thinking",
  "variant",
  "agent",
  "context",
  "autoCompact",
  "autoCompactWindow",
  "advisor",
  "subagentModel",
  "subagentPolicy",
];
const REASONING_IDS = new Set(["effort", "reasoning", "reasoningEffort"]);
const FAST_IDS = new Set(["fast", "serviceTier"]);
const CONTEXT_IDS = new Set(["context", "autoCompact", "autoCompactWindow"]);
const DELEGATION_IDS = new Set(["advisor", "subagentModel", "subagentPolicy"]);

export type SettingGroup = "model" | "context" | "delegation";

/** English titles of the secondary groups (desktop SETTING_GROUP_TITLE). */
export const SETTING_GROUP_TITLE: Record<SettingGroup, string> = {
  model: "Model",
  context: "Context",
  delegation: "Advisor and subagents",
};

export function settingGroup(setting: ModelSetting): SettingGroup {
  if (CONTEXT_IDS.has(setting.id)) return "context";
  if (DELEGATION_IDS.has(setting.id)) return "delegation";
  return "model";
}

/** One display name per meaning, whatever label the provider catalog uses. */
export function settingLabel(setting: ModelSetting): string {
  return REASONING_IDS.has(setting.id) ? "Reasoning" : setting.label;
}

/** Reasoning, Fast and Thinking stay in view; other model options go under Agent settings. */
export function isPrimarySetting(setting: ModelSetting): boolean {
  return REASONING_IDS.has(setting.id) || FAST_IDS.has(setting.id) || setting.id === "thinking";
}

/** The model's settings in the shared order, split into the Model, Context and delegation groups. */
export function groupedSettings(model: AgentModel | undefined): Record<SettingGroup, ModelSetting[]> {
  const ordered = [...(model?.settings ?? [])]
    .filter((setting) => !(model?.harness === "opencode" && setting.id === "agent"))
    .sort((a, b) => {
      const ai = SETTING_ORDER.indexOf(a.id);
      const bi = SETTING_ORDER.indexOf(b.id);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
  return {
    model: ordered.filter((setting) => settingGroup(setting) === "model"),
    context: ordered.filter((setting) => settingGroup(setting) === "context"),
    delegation: ordered.filter((setting) => settingGroup(setting) === "delegation"),
  };
}
