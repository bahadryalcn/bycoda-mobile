import type { AgentModel } from "../../../../src/features/sessions/model/models";
import { groupedSettings, isPrimarySetting, SETTING_GROUP_TITLE, settingLabel } from "./agent-model-settings";
import { View } from "react-native";
import { Disclosure, IdentifierField, SectionHeader, SelectField } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { SettingIcon } from "./agent-option-icons";
import { useCopy } from "@/ui/copy";
import { modelDefaults } from "./catalog";
import { settingLabels } from "./setting-labels";
import { ModelPickerField } from "./model-picker-field";
import type { ProviderChoice } from "./provider-choices";
import type { HostModelCatalog } from "./wire";

/** The same model and capability controls for creation and existing sessions. */
export function AgentModelFields({ models, model, settings, disabled, onChange, sparseSettings = false, provider, catalog }: {
  models: AgentModel[];
  model: string;
  settings: Record<string, string>;
  disabled?: boolean;
  sparseSettings?: boolean;
  /** Provider and account choices; with them the model and its reasoning open in one picker sheet. */
  provider?: { choices: readonly ProviderChoice[]; value: ProviderChoice | undefined; onChange: (choice: ProviderChoice) => void };
  /** The computer's models; enables bycoda's own advisor, subagents and image models in the picker. */
  catalog?: HostModelCatalog;
  onChange: (model: string, settings: Record<string, string>) => void;
}) {
  const copy = useCopy();
  const labels = settingLabels(copy);
  const selected = models.find((entry) => entry.id === model || entry.nativeId === model);
  // The id is only a second line when it adds something the name does not already say.
  const detailFor = (name: string, id: string) => name.trim().toLowerCase() === id.trim().toLowerCase() ? undefined : id;
  const options = models.map((entry) => ({ value: entry.id, label: entry.name, detail: detailFor(entry.name, entry.nativeId || entry.id) }));
  if (model && !selected) options.unshift({ value: model, label: model, detail: undefined });
  const groups = groupedSettings(selected);
  // Reasoning, Fast and Thinking lead; the rarer model options and the groups below are secondary.
  // The form reads downward; keep Reasoning first even when the mirrored desktop
  // picker orders its controls toward an upward-opening trigger.
  const primary = groups.model.filter(isPrimarySetting).sort((a, b) =>
    Number(settingLabel(a) !== "Reasoning") - Number(settingLabel(b) !== "Reasoning"));
  const otherModel = groups.model.filter((setting) => !isPrimarySetting(setting));
  // With a provider the picker sheet already carries the Context and Advisor groups.
  const context = provider ? [] : groups.context;
  const delegation = provider ? [] : groups.delegation;
  const caption = (group: "context" | "delegation") => {
    const title = SETTING_GROUP_TITLE[group];
    return <SectionHeader title={labels[title] ?? title} />;
  };
  const renderSetting = (setting: NonNullable<AgentModel["settings"]>[number]) => <SelectField
    key={setting.id}
    label={labels[settingLabel(setting)] ?? settingLabel(setting)}
    value={settings[setting.id] ?? (sparseSettings && delegation.includes(setting) ? "" : setting.value)}
    options={[
      ...(sparseSettings && delegation.includes(setting) ? [{ value: "", label: copy("Ürün varsayılanı", "Product default") }] : []),
      ...setting.options.map((option) => ({ ...option, label: labels[option.label] ?? option.label })),
    ]}
    hint={setting.description}
    icon={<SettingIcon id={setting.id} />}
    disabled={disabled}
    onChange={(value) => onChange(model, { ...settings, [setting.id]: value })}
  />;
  return <View style={{ gap: space.lg }}>
    {provider ? <ModelPickerField
      choices={provider.choices}
      choice={provider.value}
      onChooseProvider={provider.onChange}
      models={models}
      model={model}
      settings={settings}
      sparseSettings={sparseSettings}
      disabled={disabled}
      catalog={catalog}
      onChange={onChange}
    /> : <>
      <SelectField
        label={copy("Model", "Model")}
        value={selected?.id ?? model}
        options={options}
        searchable
        disabled={disabled || !options.length}
        onChange={(id) => onChange(id, sparseSettings ? {} : modelDefaults(models.find((entry) => entry.id === id)))}
      />
      {primary.map(renderSetting)}
    </>}
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
          onChange(id, sparseSettings ? {} : modelDefaults(target));
        }}
      />
    </Disclosure>
  </View>;
}
