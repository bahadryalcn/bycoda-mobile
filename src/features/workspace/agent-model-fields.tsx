import type { AgentModel } from "../../../../src/features/sessions/model/models";
import { groupedSettings, isPrimarySetting, SETTING_GROUP_TITLE, settingLabel } from "./agent-model-settings";
import { Body, Disclosure, IdentifierField, SelectField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { modelDefaults } from "./catalog";

/** The same model and capability controls for creation and existing sessions. */
export function AgentModelFields({ models, model, settings, disabled, onChange }: {
  models: AgentModel[];
  model: string;
  settings: Record<string, string>;
  disabled?: boolean;
  onChange: (model: string, settings: Record<string, string>) => void;
}) {
  const copy = useCopy();
  const labels: Record<string, string> = {
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
  const selected = models.find((entry) => entry.id === model || entry.nativeId === model);
  const options = models.map((entry) => ({ value: entry.id, label: entry.name, detail: entry.nativeId || entry.id }));
  if (model && !selected) options.unshift({ value: model, label: model, detail: model });
  const groups = groupedSettings(selected);
  // Reasoning, Fast and Thinking lead; the rarer model options and the groups below are secondary.
  const primary = groups.model.filter(isPrimarySetting);
  const otherModel = groups.model.filter((setting) => !isPrimarySetting(setting));
  const { context, delegation } = groups;
  const caption = (group: "context" | "delegation") => {
    const title = SETTING_GROUP_TITLE[group];
    return <Body muted>{labels[title] ?? title}</Body>;
  };
  const renderSetting = (setting: NonNullable<AgentModel["settings"]>[number]) => <SelectField
    key={setting.id}
    label={labels[settingLabel(setting)] ?? settingLabel(setting)}
    value={settings[setting.id] ?? setting.value}
    options={setting.options.map((option) => ({ ...option, label: labels[option.label] ?? option.label }))}
    hint={setting.description}
    disabled={disabled}
    onChange={(value) => onChange(model, { ...settings, [setting.id]: value })}
  />;
  return <>
    <SelectField
      label={copy("Model", "Model")}
      value={selected?.id ?? model}
      options={options}
      searchable
      disabled={disabled || !options.length}
      onChange={(id) => onChange(id, modelDefaults(models.find((entry) => entry.id === id)))}
    />
    {selected?.nativeId ? <Body muted mono>{selected.nativeId}</Body> : null}
    {primary.map(renderSetting)}
    {context.length ? <>{caption("context")}{context.map(renderSetting)}</> : null}
    {otherModel.length || delegation.length ? <Disclosure label={copy("Ajan ayarları", "Agent settings")}>
      {otherModel.map(renderSetting)}
      {delegation.length ? <>{caption("delegation")}{delegation.map(renderSetting)}</> : null}
    </Disclosure> : null}
    <Disclosure label={copy("Özel model kimliği", "Custom model ID")}>
      <IdentifierField
        label={copy("Model kimliği", "Model ID")}
        value={model}
        editable={!disabled}
        onChangeText={(id) => {
          const target = models.find((entry) => entry.id === id || entry.nativeId === id);
          onChange(id, modelDefaults(target));
        }}
      />
    </Disclosure>
  </>;
}
