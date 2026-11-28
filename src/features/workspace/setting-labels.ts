type Copy = (tr: string, en: string) => string;

/** Localized names of the model settings and their common choices, keyed by the catalog's English label. */
export function settingLabels(copy: Copy): Record<string, string> {
  return {
    Reasoning: copy("Akıl yürütme", "Reasoning"),
    Variant: copy("Varyant", "Variant"),
    "Service Tier": copy("Hız katmanı", "Service Tier"),
    Fast: copy("Hızlı", "Fast"),
    Thinking: copy("Düşünme", "Thinking"),
    Context: copy("Bağlam", "Context"),
    "Advisor and subagents": copy("Danışman ve alt ajanlar", "Advisor and subagents"),
    None: copy("Yok", "None"),
    Minimal: copy("En az", "Minimal"),
    Low: copy("Düşük", "Low"),
    Medium: copy("Orta", "Medium"),
    High: copy("Yüksek", "High"),
    "Extra High": copy("Çok yüksek", "Extra High"),
    Xhigh: copy("Çok yüksek", "Extra High"),
    XHigh: copy("Çok yüksek", "Extra High"),
    Max: copy("En yüksek", "Max"),
    On: copy("Açık", "On"),
    Off: copy("Kapalı", "Off"),
    Standard: copy("Standart", "Standard"),
  };
}
