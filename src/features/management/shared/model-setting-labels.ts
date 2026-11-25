import { settingLabels } from "../../workspace/setting-labels";

type Copy = (tr: string, en: string) => string;

/** The catalog's English setting names and choices, in the app language. Unknown labels stay as the catalog gives them. */
export function modelSettingLabels(copy: Copy): (label: string) => string {
  const labels: Record<string, string> = {
    ...settingLabels(copy),
    Advisor: copy("Danışman", "Advisor"),
    Subagent: copy("Alt ajan", "Subagent"),
    "Subagent model": copy("Alt ajan modeli", "Subagent model"),
    "Subagent model policy": copy("Alt ajan model ilkesi", "Subagent model policy"),
    "Auto-compact": copy("Otomatik sıkıştırma", "Auto-compact"),
    "Auto-compact window": copy("Otomatik sıkıştırma penceresi", "Auto-compact window"),
    "Claude default": copy("Claude varsayılanı", "Claude default"),
    "Agent's choice": copy("Ajan seçer", "Agent's choice"),
    Default: copy("Varsayılan", "Default"),
    Minimal: copy("En az", "Minimal"),
    Max: copy("En yüksek", "Max"),
  };
  return (label) => labels[label] ?? label;
}
