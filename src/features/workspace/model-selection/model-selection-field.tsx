import { useCopy } from "@/ui/copy";
import type {
  ModelRoutingItemChoice,
  ModelRoutingRole,
} from "../../../../../src/shared/model/host-contracts/model-routing";
import { ModelPickerField } from "../model-picker-field";
import type { HostModelCatalog, RemoteProvider } from "../wire";
import { chooseFixedModel, chooseFixedProvider, fixedModelChoices, type FixedModel } from "./fixed-model";
import { ModelChoiceField } from "./model-choice-field";
import { entrySettings } from "./model-choice-model";

export type ModelSelectionValue = FixedModel & { modelChoice?: ModelRoutingItemChoice };

/**
 * The shared fixed-model field: the grouped provider → account → model picker with effort.
 * Any stored fixed model (a task's own model, a crew member's first candidate…) adapts to it.
 */
export function FixedModelField<T extends FixedModel>({
  value,
  onChange,
  catalog: hostCatalog,
  providers,
  disabled,
  label,
  accounts = true,
}: {
  value: T;
  onChange: (value: T) => void;
  catalog: HostModelCatalog | undefined;
  providers: readonly RemoteProvider[];
  disabled?: boolean;
  /** Field name when "Model" alone is ambiguous (e.g. "Reply model"). */
  label?: string;
  /**
   * False for a store without `providerAccountId` (the assistant's execution): providers are
   * listed without accounts, so a picked account is never silently dropped.
   */
  accounts?: boolean;
}) {
  const copy = useCopy();
  const catalog = accounts || !hostCatalog ? hostCatalog : { ...hostCatalog, accounts: undefined };
  const { choices, choice, unavailableAccount, models } = fixedModelChoices(
    value,
    providers,
    catalog,
    copy("Varsayılan hesap", "Default account"),
    copy("Hesap kullanılamıyor", "Account unavailable"),
  );
  return (
    <ModelPickerField
      label={label}
      choices={choices}
      choice={choice}
      unavailableAccount={unavailableAccount}
      models={models}
      model={value.model}
      settings={value.modelSettings ?? {}}
      catalog={catalog}
      ownAgents={false}
      disabled={disabled}
      onChooseProvider={(next) => onChange(chooseFixedProvider(value, next, catalog))}
      onChooseModel={(next, model, nextSettings) => onChange(chooseFixedModel(value, next, model, nextSettings))}
      onChange={(model, nextSettings) => {
        if (!unavailableAccount) onChange({ ...value, model, modelSettings: nextSettings });
      }}
    />
  );
}

/**
 * The model field of work items (tasks, goals, stewards, automations): the shared grouped model
 * picker for a fixed model, inside the shared Use settings | Any model | Fixed choice when the
 * computer offers model routing and the surface has a routing role. Only the model fields of
 * `value` change; everything else round-trips.
 */
export function ModelSelectionField<T extends ModelSelectionValue>({
  value,
  onChange,
  catalog,
  providers,
  routingRole,
  allowDefault = true,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  catalog: HostModelCatalog | undefined;
  providers: readonly RemoteProvider[];
  /** Without a role the surface stores only a fixed model. */
  routingRole?: ModelRoutingRole;
  allowDefault?: boolean;
  disabled?: boolean;
}) {
  const settings = value.modelSettings ?? {};
  const fixed = (
    <FixedModelField value={value} onChange={onChange} catalog={catalog} providers={providers} disabled={disabled} />
  );
  if (!routingRole) return fixed;
  return (
    <ModelChoiceField
      role={routingRole}
      value={value.modelChoice}
      allowDefault={allowDefault}
      catalog={catalog}
      disabled={disabled}
      fixedTarget={value.model.trim() ? {
        harness: value.harness,
        model: value.model,
        ...(value.providerAccountId ? { providerAccountId: value.providerAccountId } : {}),
        modelSettings: entrySettings(settings),
      } : undefined}
      fixed={fixed}
      onChange={(modelChoice) => onChange({ ...value, modelChoice })}
    />
  );
}
