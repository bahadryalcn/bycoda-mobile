import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  Disclosure,
  Body,
  Empty,
  NavigationGroup,
  NavigationRow,
  SearchField,
  SelectField,
  Sheet,
  FormActions,
} from "@/ui/primitives";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { filterSelection } from "@/ui/selection-model";
import { space } from "@/ui/tokens";
import type { AgentModel, ModelSetting } from "../../../../src/features/sessions/model/models";
import { modelDefaults } from "./catalog";
import { inlineSettings, modelRows } from "./model-picker-model";
import { providerName, type ProviderChoice } from "./provider-choices";
import { groupedSettings, SETTING_GROUP_TITLE } from "./agent-model-settings";
import { settingLabels } from "./setting-labels";
import { SettingField } from "./setting-field";
import { DelegationFields } from "./delegation-fields";
import { delegationCandidates, imageChoices } from "./delegation-model";
import {
  carryCrossDelegation,
  decodeSubagents,
  CROSS_SUBAGENTS_KEY,
} from "../../../../src/shared/model/host-contracts/delegation";
import type { HostModelCatalog } from "./wire";

export type ModelPickerProps = {
  visible: boolean;
  onClose: () => void;
  /** Providers and accounts the computer offers; one entry hides the provider strip. */
  choices: readonly ProviderChoice[];
  choice: ProviderChoice | undefined;
  onChooseProvider: (choice: ProviderChoice) => void;
  models: readonly AgentModel[];
  model: string;
  settings: Record<string, string>;
  /** New-session forms keep unset settings unset until the owner picks one. */
  sparseSettings?: boolean;
  disabled?: boolean;
  /** Only session editors submit; form consumers retain their outer action. */
  onSave?: () => void;
  dirty?: boolean;
  pending?: boolean;
  saveDisabled?: boolean;
  /** The saved account no longer appears in the Host catalog. Account repair stays available. */
  unavailableAccount?: boolean;
  /** Status shown above the lists, e.g. why choices are locked. */
  notice?: ReactNode;
  /** Sheet title; session editors that include access name it "Model and access". */
  title?: string;
  /** Further fields of the same draft after the model list (access, context reading). */
  extra?: ReactNode;
  /**
   * The computer's model catalogue. With it the sheet offers bycoda's own Agents (advisor, subagents
   * and image models from any provider) instead of the provider's native advisor settings.
   */
  catalog?: HostModelCatalog;
  onChange: (model: string, settings: Record<string, string>) => void;
};

/**
 * Bottom-sheet model picker, the mobile form of the desktop provider/model/reasoning menu:
 * accounts and selected model settings first, then searchable models and secondary options.
 */
export const MODEL_SEARCH_THRESHOLD = 6;

export function ModelPicker({
  visible,
  onClose,
  choices,
  choice,
  onChooseProvider,
  models,
  model,
  settings,
  sparseSettings,
  disabled,
  onSave,
  dirty = false,
  pending = false,
  saveDisabled,
  unavailableAccount,
  notice,
  title,
  extra,
  catalog,
  onChange,
}: ModelPickerProps) {
  const copy = useCopy();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const labels = settingLabels(copy);
  const rows = useMemo(
    () => modelRows(models, model),
    [models, model],
  );
  const filtered = useMemo(() => filterSelection(rows, search, locale), [rows, search, locale]);
  const selected = models.find((entry) => entry.id === model || entry.nativeId === model);
  const searchable = rows.length > MODEL_SEARCH_THRESHOLD || !!search;
  const close = () => {
    setSearch("");
    onClose();
  };
  const settingRows = inlineSettings(selected);
  // One card per agent; the accounts of the chosen agent sit in a single select instead of a wall of cards.
  const providers = choices.filter(
    (item, index) => choices.findIndex((other) => other.provider === item.provider) === index,
  );
  const accounts = choices.filter((item) => item.provider === choice?.provider);
  const singleAccount = !unavailableAccount && accounts.length === 1 && choice?.accountId
    ? choice.label : undefined;
  const label = (text: string) => labels[text] ?? text;
  const grouped = groupedSettings(selected);
  const providerIds = useMemo(() => [...new Set(choices.map((item) => item.provider))], [choices]);
  const candidates = useMemo(
    () => (catalog ? delegationCandidates(catalog, providerIds) : []),
    [catalog, providerIds],
  );
  const images = useMemo(() => imageChoices(providerIds), [providerIds]);
  // bycoda's own delegation replaces the provider-native advisor and subagent model.
  const ownAgents = !!catalog && (candidates.length > 0 || images.length > 0);
  const delegationItems = ownAgents
    ? grouped.delegation.filter((item) => item.id !== "advisor" && item.id !== "subagentModel")
    : grouped.delegation;
  const noSubagents =
    decodeSubagents(settings[CROSS_SUBAGENTS_KEY]).length === 0 &&
    (!settings.subagentModel || settings.subagentModel === "default");
  const groups = (["context"] as const)
    .map((group) => ({ group, items: grouped[group] }))
    .filter((entry) => entry.items.length);
  const field =
    (unsetAllowed = false) =>
    (setting: ModelSetting) => (
      <SettingField
        key={setting.id}
        setting={setting}
        value={settings[setting.id] ?? ""}
        unsetAllowed={unsetAllowed}
        disabled={
          disabled ||
          unavailableAccount ||
          (ownAgents && setting.id === "subagentPolicy" && noSubagents)
        }
        onChange={(value) => onChange(model, { ...settings, [setting.id]: value })}
      />
    );
  return (
    <Sheet
      visible={visible}
      title={title ?? copy("Model", "Model")}
      size="form"
      onClose={close}
      dirty={dirty}
      dismissible={!pending}
      footer={
        onSave ? (
          <FormActions
            submitLabel={copy("Kaydet", "Save")}
            onSubmit={onSave}
            busy={pending}
            dirty={dirty}
            disabled={!dirty || disabled || unavailableAccount || saveDisabled}
          />
        ) : (
          <FormActions submitLabel={copy("Tamam", "Done")} onSubmit={close} />
        )
      }
    >
      <View style={{ gap: space.lg }}>
        {notice ? <View>{notice}</View> : null}
        {providers.length === 1 && choice ? (
          <Body muted>{[providerName(choice.provider), singleAccount].filter(Boolean).join(" · ")}</Body>
        ) : null}
        {providers.length > 1 ? (
          <SelectField
            label={copy("Ajan", "Agent")}
            value={choice?.provider ?? providers[0]!.provider}
            options={providers.map((item) => ({
              value: item.provider,
              label: providerName(item.provider),
              icon: <ProviderAccountMark provider={item.provider} size={18} />,
            }))}
            disabled={disabled}
            onChange={(provider) => {
              if (provider === choice?.provider) return;
              const next = choices.find((item) => item.provider === provider);
              if (next) {
                setSearch("");
                onChooseProvider(next);
              }
            }}
          />
        ) : null}
        {accounts.length > 1 || unavailableAccount ? (
          <SelectField
            label={copy("Hesap", "Account")}
            value={choice?.key ?? accounts[0]?.key ?? ""}
            options={[
              ...(unavailableAccount && choice
                ? [{ value: choice.key, label: choice.label, disabled: true }]
                : []),
              ...accounts.map((item) => ({
                value: item.key,
                label: item.label,
                icon: (
                  <ProviderAccountMark provider={item.provider} color={item.color} size={18} />
                ),
              })),
            ]}
            disabled={disabled}
            onChange={(key) => {
              const next = accounts.find((item) => item.key === key);
              if (next && next.key !== choice?.key) {
                setSearch("");
                onChooseProvider(next);
              }
            }}
          />
        ) : null}
        {providers.length > 1 && singleAccount ? (
          <Body muted>
            {copy("Hesap", "Account")}: {singleAccount}
          </Body>
        ) : null}
        {settingRows.map(field())}
        <View style={{ gap: space.xs }}>
          {searchable ? (
            <SearchField
              label={copy("Model ara", "Search models")}
              value={search}
              onChangeText={setSearch}
            />
          ) : null}
          {filtered.length ? (
            <NavigationGroup>
              {filtered.map((item) => (
                <NavigationRow
                  key={item.value}
                  label={item.label}
                  icon={choice ? <ProviderAccountMark provider={choice.provider} size={18} /> : undefined}
                  selected={item.selected}
                  disabled={disabled || unavailableAccount}
                  onPress={() => {
                    if (item.selected) return;
                    const next = models.find((entry) => entry.id === item.value);
                    onChange(
                      item.value,
                      carryCrossDelegation(settings, sparseSettings ? {} : modelDefaults(next)),
                    );
                  }}
                />
              ))}
            </NavigationGroup>
          ) : (
            <Empty
              compact
              title={
                rows.length
                  ? copy("Eşleşen model yok.", "No matching models.")
                  : copy("Kullanılabilir model yok.", "No models available.")
              }
            />
          )}
        </View>
        {extra}
        {groups.map(({ group, items }) => (
          <Disclosure key={group} label={label(SETTING_GROUP_TITLE[group])}>
            <View style={{ gap: space.lg }}>{items.map(field())}</View>
          </Disclosure>
        ))}
        {ownAgents || delegationItems.length ? (
          <Disclosure
            label={ownAgents ? copy("Ajanlar", "Agents") : label(SETTING_GROUP_TITLE.delegation)}
          >
            <View style={{ gap: space.lg }}>
              {ownAgents ? (
                <DelegationFields
                  candidates={candidates}
                  imageChoices={images}
                  settings={settings}
                  disabled={disabled || unavailableAccount}
                  onChange={(next) => onChange(model, next)}
                />
              ) : null}
              {delegationItems.map(field(!!sparseSettings))}
            </View>
          </Disclosure>
        ) : null}
      </View>
    </Sheet>
  );
}
