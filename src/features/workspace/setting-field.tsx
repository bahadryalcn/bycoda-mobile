import { SegmentedControl, SelectField, ToggleField } from "@/ui/primitives";
import { LevelSlider } from "@/ui/level-slider";
import { useCopy } from "@/ui/copy";
import type { ModelSetting } from "../../../../src/features/sessions/model/models";
import { settingLabel } from "./agent-model-settings";
import { settingControl, toggleSides } from "./model-picker-model";
import { SettingIcon } from "./agent-option-icons";
import { settingLabels } from "./setting-labels";

/**
 * One model setting with the control that fits it: a switch for on/off and Fast, a stepped bar for
 * the reasoning scale, segments for up to three choices, an inline select for longer lists.
 * `unsetAllowed` adds a "Product default" choice for settings a form may leave unset.
 */
export function SettingField({ setting, value, unsetAllowed, disabled, onChange }: {
  setting: ModelSetting;
  /** The chosen value; empty means unset. */
  value: string;
  unsetAllowed?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const copy = useCopy();
  const labels = settingLabels(copy);
  // The fast tier is always titled "Fast", whatever the provider calls the setting.
  const name = /^(fast|serviceTier)$/.test(setting.id) ? "Fast" : settingLabel(setting);
  const title = labels[name] ?? name;
  const options = setting.options.map((option) => ({ value: option.value, label: labels[option.label] ?? option.label }));
  const current = value || (unsetAllowed ? "" : setting.value);
  const control = settingControl(setting);
  const sides = toggleSides(setting);
  if (sides) {
    return (
      <ToggleField label={title} value={(current || setting.value) === sides.on.value}
        disabled={disabled} onChange={(next) => onChange(next ? sides.on.value : sides.off.value)} />
    );
  }
  if (control === "slider" && !unsetAllowed) {
    return (
      <LevelSlider label={title} value={current || setting.value} options={options} disabled={disabled} onChange={onChange}
        lowLabel={copy("Daha hızlı", "Faster")} highLabel={copy("Daha derin", "Deeper")} />
    );
  }
  if (control === "segments" && !unsetAllowed) {
    return <SegmentedControl label={title} value={current || setting.value} options={options} disabled={disabled} onChange={onChange} />;
  }
  return (
    <SelectField
      label={title}
      value={current}
      options={[...(unsetAllowed ? [{ value: "", label: copy("Ürün varsayılanı", "Product default") }] : []), ...options]}
      hint={setting.description && (labels[setting.description] ?? setting.description)}
      icon={<SettingIcon id={setting.id} />}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
