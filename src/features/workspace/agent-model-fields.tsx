import type { AgentModel } from "../../../../src/features/sessions/model/models";
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
    "Service Tier": copy("Hız", "Speed"),
    Fast: copy("Hızlı mod", "Fast mode"),
    Thinking: copy("Düşünme", "Thinking"),
    Context: copy("Bağlam", "Context"),
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
  const primaryIds = new Set(["reasoningEffort", "effort", "fast", "thinking", "context", "serviceTier"]);
  const advanced = (selected?.settings ?? []).filter((setting) => !primaryIds.has(setting.id));
  const renderSetting = (setting: NonNullable<AgentModel["settings"]>[number]) => <SelectField
    key={setting.id}
    label={labels[setting.label] ?? setting.label}
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
    {(selected?.settings ?? []).filter((setting) => primaryIds.has(setting.id)).map(renderSetting)}
    {advanced.length ? <Disclosure label={copy("Ajan ayarları", "Agent settings")}>
      {advanced.map(renderSetting)}
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
