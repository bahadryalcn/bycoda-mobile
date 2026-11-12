type Copy = (tr: string, en: string) => string;

/** Localized names of the model settings and their common choices, keyed by the catalog's English label. */
export function settingLabels(copy: Copy): Record<string, string> {
  return {
    Reasoning: copy("Akıl yürütme", "Reasoning"),
    "Service Tier": copy("Hız katmanı", "Service Tier"),
    Fast: copy("Hızlı", "Fast"),
    Thinking: copy("Düşünme", "Thinking"),
    Context: copy("Bağlam", "Context"),
    "Advisor and subagents": copy("Danışman ve alt ajanlar", "Advisor and subagents"),
    Low: copy("Düşük", "Low"),
    Medium: copy("Orta", "Medium"),
    High: copy("Yüksek", "High"),
    "Extra High": copy("Çok yüksek", "Extra High"),
    Xhigh: copy("Çok yüksek", "Extra High"),
    On: copy("Açık", "On"),
    Off: copy("Kapalı", "Off"),
    Standard: copy("Standart", "Standard"),
  };
}
