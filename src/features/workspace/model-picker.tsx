import { Fragment, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  Disclosure,
  Body,
  Empty,
  NavigationGroup,
  NavigationRow,
  SearchField,
  Sheet,
  FormActions,
} from "@/ui/primitives";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { GroupHeading, SubgroupHeading } from "@/ui/group-heading";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import type { AgentModel, ModelSetting } from "../../../../src/features/sessions/model/models";
import { modelDefaults } from "./catalog";
import { inlineSettings, pickerSections } from "./model-picker-model";
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
  /** Providers and accounts the computer offers; each is one group of the model list. */
  choices: readonly ProviderChoice[];
  choice: ProviderChoice | undefined;
  onChooseProvider: (choice: ProviderChoice) => void;
  /**
   * A model of another provider or account picked in one step. Without it such a pick only
   * switches the account (`onChooseProvider`) and the owner chooses the model.
   */
  onChooseModel?: (choice: ProviderChoice, model: string, settings: Record<string, string>) => void;
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
  /**
   * Offer bycoda's own Agents (advisor, subagents, image models) from the catalogue. Work items
   * keep their helpers elsewhere and pass false; the catalogue then only lists other accounts' models.
   */
  ownAgents?: boolean;
  onChange: (model: string, settings: Record<string, string>) => void;
};

/**
 * Bottom-sheet model picker, the mobile form of the desktop provider/model/reasoning menu:
 * the current model and its effort first, then one searchable list grouped by provider and account
 * (the same grouping as the subagent picker, see model-groups.ts), then secondary options.
 */
export const MODEL_SEARCH_THRESHOLD = 6;

export function ModelPicker({
  visible,
  onClose,
  choices,
  choice,
  onChooseProvider,
  onChooseModel,
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
  ownAgents: agentsAllowed = true,
  onChange,
}: ModelPickerProps) {
  const copy = useCopy();
  const locale = useLocale();
  const { uiStyles } = useMobileTheme();
  const [search, setSearch] = useState("");
  const labels = settingLabels(copy);
  // One list grouped by provider and account, in the same order as the subagent picker.
  const sections = useMemo(
    () => pickerSections(choices, choice, models, model, catalog?.models),
    [choices, choice, models, model, catalog],
  );
  const filtered = useMemo(
    () => (search ? pickerSections(choices, choice, models, model, catalog?.models, search, locale) : sections),
    [sections, search, locale, choices, choice, models, model, catalog],
  );
  const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const selected = models.find((entry) => entry.id === model || entry.nativeId === model);
  const searchable = total > MODEL_SEARCH_THRESHOLD || !!search;
  const close = () => {
    setSearch("");
    onClose();
  };
  const settingRows = inlineSettings(selected);
  const pick = (target: ProviderChoice, id: string) => {
    const own = target.key === choice?.key;
    if (own && id === model) return;
    const next = (own ? models : catalog?.models[target.provider] ?? []).find((entry) => entry.id === id);
    // The same model under another account keeps its effort; a new model starts from its defaults.
    const nextSettings = id === model ? settings : carryCrossDelegation(settings, sparseSettings ? {} : modelDefaults(next));
    if (own) return onChange(id, nextSettings);
    setSearch("");
    if (onChooseModel) onChooseModel(target, id, nextSettings);
    else onChooseProvider(target);
  };
  const currentAccount = choice && choice.label !== providerName(choice.provider) ? choice.label : undefined;
  const label = (text: string) => labels[text] ?? text;
  const grouped = groupedSettings(selected);
  const providerIds = useMemo(() => [...new Set(choices.map((item) => item.provider))], [choices]);
  const candidates = useMemo(
    () => (catalog && agentsAllowed ? delegationCandidates(catalog, providerIds, copy("Varsayılan hesap", "Default account")) : []),
    // copy follows the locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, providerIds, locale, agentsAllowed],
  );
  const images = useMemo(() => (agentsAllowed ? imageChoices(providerIds) : []), [providerIds, agentsAllowed]);
  // bycoda's own delegation replaces the provider-native advisor and subagent model.
  const ownAgents = !!catalog && agentsAllowed && (candidates.length > 0 || images.length > 0);
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
        {choice ? (
          // The current choice leads, with its effort controls right under it.
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <ProviderAccountMark provider={choice.provider} color={choice.color} size={22} />
            <View style={uiStyles.grow}>
              <Body selectable={false} style={uiStyles.label}>
                {selected?.name ?? (model || copy("Model seç…", "Select model…"))}
              </Body>
              <Body selectable={false} muted style={uiStyles.caption}>
                {[providerName(choice.provider), currentAccount].filter(Boolean).join(" · ")}
              </Body>
            </View>
          </View>
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
            filtered.map((section) => {
              const head = section.rows[0]!.item.choice;
              const own = head.key === choice?.key;
              return (
                <View key={section.key}>
                  <GroupHeading
                    title={section.title}
                    icon={<ProviderAccountMark provider={section.provider} color={head.color} size={18} />}
                  />
                  <NavigationGroup>
                    {section.rows.map(({ item, label: rowLabel, family }, index) => (
                      <Fragment key={item.value}>
                        {family && family !== section.rows[index - 1]?.family ? (
                          <SubgroupHeading title={family} />
                        ) : null}
                        <NavigationRow
                          label={rowLabel}
                          accessibilityLabel={[family, rowLabel, section.title].filter(Boolean).join(". ")}
                          selected={item.selected}
                          disabled={disabled || (own && unavailableAccount)}
                          onPress={() => pick(item.choice, item.model)}
                        />
                      </Fragment>
                    ))}
                  </NavigationGroup>
                </View>
              );
            })
          ) : (
            <Empty
              compact
              title={
                total
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
