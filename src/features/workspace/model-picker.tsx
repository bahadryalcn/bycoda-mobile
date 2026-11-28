import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import {
  Disclosure,
  Body,
  Empty,
  NavigationGroup,
  NavigationRow,
  SearchField,
  SegmentedControl,
  Sheet,
  FormActions,
} from "@/ui/primitives";
import { FilterChipRow } from "@/ui/filter-sheet";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { GroupHeading } from "@/ui/group-heading";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import type { AgentModel, ModelSetting } from "../../../../src/features/sessions/model/models";
import { modelDefaults } from "./catalog";
import {
  carryReasoning,
  distinctModelCount,
  entryFor,
  inlineSettings,
  pickerProviders,
  reasoningChosen,
  reasoningLabel,
  searchPicker,
  selectedEntry,
  variantSetting,
  type PickerAccount,
  type PickerEntry,
  type PickerGroup,
} from "./model-picker-model";
import { variantFor } from "./model-variants";
import { providerName, unavailableProviderChoices, type ProviderChoice } from "./provider-choices";
import { PickerAccountRows } from "./model-picker-accounts";
import { MachinePickerAccountRows } from "./model-picker-account-usage";
import { PickerRecents } from "./model-picker-recents";
import { recentPicks, type RecentModel } from "./recent-models";
import { groupedSettings, settingLabel, SETTING_GROUP_TITLE } from "./agent-model-settings";
import { settingLabels } from "./setting-labels";
import { SettingField } from "./setting-field";
import { DelegationFields } from "./delegation-fields";
import { delegationCandidates, imageChoices, readDelegation } from "./delegation-model";
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
  /** Models recently used on this computer, newest first; offered as one-tap rows. */
  recents?: readonly RecentModel[];
  /**
   * Show the connected computer's quota on the account rows. Only for consumers bound to the
   * active computer; the report is read from the Limits feature's cache while the rows show.
   */
  accountUsage?: boolean;
  onChange: (model: string, settings: Record<string, string>) => void;
};

/**
 * Bottom-sheet model picker, the mobile form of the desktop provider/model/reasoning menu.
 * Model: the current model and its effort first, then a search over every provider, recently used
 * models, a provider rail, the provider's accounts as rows when it has several logins (another
 * account of the current provider takes the same model in one tap) and the browsed account's
 * models (effort variants as one row, multi-vendor catalogues grouped by vendor), then secondary
 * options.
 * Agents (bycoda's own advisor, subagents and image models) is the second segment.
 */
export const MODEL_SEARCH_THRESHOLD = 6;

type Tab = "model" | "agents";

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
  recents,
  accountUsage,
  onChange,
}: ModelPickerProps) {
  const copy = useCopy();
  const locale = useLocale();
  const { uiStyles } = useMobileTheme();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("model");
  // The provider and account being browsed; undefined follows the current choice.
  const [browseProvider, setBrowseProvider] = useState<string>();
  const [browseAccount, setBrowseAccount] = useState<string>();
  const labels = settingLabels(copy);
  const label = (text: string) => labels[text] ?? text;
  const providers = useMemo(
    () => pickerProviders(choices, choice, models, model, catalog?.models),
    [choices, choice, models, model, catalog],
  );
  const results = useMemo(() => searchPicker(providers, search, locale), [providers, search, locale]);
  const searching = !!search.trim();
  const searchable = distinctModelCount(providers) > MODEL_SEARCH_THRESHOLD || !!search;
  const ownAccount = providers.flatMap((provider) => provider.accounts).find((account) => account.own);
  const provider =
    providers.find((item) => item.provider === browseProvider) ??
    providers.find((item) => item.provider === choice?.provider) ??
    providers[0];
  const account =
    provider?.accounts.find((item) => item.key === browseAccount) ??
    provider?.accounts.find((item) => item.own) ??
    provider?.accounts[0];
  const selected = models.find((entry) => entry.id === model || entry.nativeId === model);
  const current = selectedEntry(ownAccount);
  const settingRows = inlineSettings(selected);
  // A model whose efforts are separate catalogue entries gets them as its Reasoning control; beside
  // a native Reasoning setting they stay reachable as a Variant control.
  const effortVariants = variantSetting(current, settingRows.some((setting) => settingLabel(setting) === "Reasoning"));
  const currentEffort = current?.variants
    ? current.variants.find((variant) => variant.item.model === current.item.model)?.label
    : reasoningLabel(selected, settings);
  // Every close starts the next opening on the session's own provider, account and Model tab;
  // consumers also close the sheet themselves after a save.
  useEffect(() => {
    if (visible) return;
    setSearch("");
    setTab("model");
    setBrowseProvider(undefined);
    setBrowseAccount(undefined);
  }, [visible]);
  const close = onClose;
  // The effort a new model keeps; a sparse form only carries one the owner chose.
  const carriedEffort = !sparseSettings || reasoningChosen(selected, settings) ? currentEffort : undefined;
  const pick = (target: ProviderChoice, id: string) => {
    const own = target.key === choice?.key;
    if (own && id === model) return;
    const next = (own ? models : catalog?.models[target.provider] ?? []).find((entry) => entry.id === id);
    // The same model under another account keeps its settings; a new model starts from its
    // defaults with the effort in use when it offers that effort.
    const nextSettings = id === model
      ? settings
      : carryReasoning(next, carryCrossDelegation(settings, sparseSettings ? {} : modelDefaults(next)), carriedEffort);
    if (own) return onChange(id, nextSettings);
    setSearch("");
    // The list follows the account that is now in use.
    setBrowseProvider(undefined);
    setBrowseAccount(undefined);
    if (onChooseModel) onChooseModel(target, id, nextSettings);
    else onChooseProvider(target);
  };
  // A model with effort variants opens at the effort in use when it offers that effort.
  const pickEntry = (entry: PickerEntry) => {
    const target = entry.selected ? entry.item : variantFor(entry, currentEffort);
    pick(target.choice, target.model);
  };
  // Another account of the session's provider takes the same model and settings in one tap; on
  // another provider, or when that account does not list the model, it only shows its models.
  const chooseAccount = (target: PickerAccount) => {
    const sameProvider = !disabled && !target.own && target.choice.provider === choice?.provider;
    // The saved id can be the provider's native id; the account lists the catalogue id.
    if (sameProvider && entryFor(target, selected?.id ?? model)) pick(target.choice, model);
    // After the pick, which returns the list to the account in use: this account stays listed
    // until the consumer has taken the change.
    setBrowseAccount(target.key);
  };
  const currentAccount = choice && choice.label !== providerName(choice.provider) ? choice.label : undefined;
  const grouped = groupedSettings(selected);
  const providerIds = useMemo(() => [...new Set(choices.map((item) => item.provider))], [choices]);
  const candidates = useMemo(
    () => (catalog && agentsAllowed ? delegationCandidates(catalog, providerIds, copy("Varsayılan hesap", "Default account")) : []),
    // copy follows the locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, providerIds, locale, agentsAllowed],
  );
  const images = useMemo(
    () => (agentsAllowed ? imageChoices(providerIds, catalog) : []),
    [providerIds, catalog, agentsAllowed],
  );
  // bycoda's own delegation replaces the provider-native advisor and subagent model.
  const ownAgents = !!catalog && agentsAllowed && (candidates.length > 0 || images.length > 0);
  const delegationItems = ownAgents
    ? grouped.delegation.filter((item) => item.id !== "advisor" && item.id !== "subagentModel")
    : grouped.delegation;
  const noSubagents =
    decodeSubagents(settings[CROSS_SUBAGENTS_KEY]).length === 0 &&
    (!settings.subagentModel || settings.subagentModel === "default");
  const delegation = readDelegation(settings);
  const agentCount = (delegation.advisor ? 1 : 0) + delegation.subagents.length;
  const groups = (["context"] as const)
    .map((group) => ({ group, items: grouped[group] }))
    .filter((entry) => entry.items.length);
  const activeTab: Tab = ownAgents ? tab : "model";
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
  const rows = (target: PickerAccount, group: PickerGroup) => (
    <NavigationGroup>
      {group.entries.map((entry) => {
        const range = entry.variants
          ? [entry.variants[0]!, entry.variants.at(-1)!].map((variant) => label(variant.label)).join(" – ")
          : undefined;
        const detail = entry.selected && entry.variants && currentEffort ? label(currentEffort) : range;
        return (
          <NavigationRow
            key={entry.key}
            label={entry.label}
            {...(detail ? { detail } : {})}
            // The raw catalogue name ("Auto · anthropic/claude-opus-4.6") stays spoken.
            accessibilityLabel={[entry.label, detail, group.title, target.title, entry.item.name !== entry.label ? entry.item.name : undefined]
              .filter(Boolean).join(". ")}
            selected={entry.selected}
            disabled={disabled || (target.own && unavailableAccount)}
            onPress={() => pickEntry(entry)}
          />
        );
      })}
    </NavigationGroup>
  );
  const list = (target: PickerAccount, groupsShown: readonly PickerGroup[], expanded: boolean) =>
    groupsShown.map((group) =>
      group.title ? (
        // Vendor groups of a multi-vendor catalogue; the one holding the selection starts open.
        <Disclosure
          key={`${target.key}\u0000${group.key}\u0000${expanded ? "open" : ""}`}
          label={group.title}
          detail={String(group.entries.length)}
          defaultExpanded={expanded || group.selected}
        >
          {rows(target, group)}
        </Disclosure>
      ) : (
        <View key={`${target.key}\u0000${group.key}`}>{rows(target, group)}</View>
      ),
    );
  const accountEntries = account?.groups.reduce((sum, group) => sum + group.entries.length, 0) ?? 0;
  // What the computer lists for the account; a saved model is a row of its own even without a list.
  const listedModels = account
    ? (account.own ? models.length : catalog?.models[account.choice.provider]?.length ?? 0)
    : 0;
  const defaultAccount = copy("Varsayılan hesap", "Default account");
  const unavailable = useMemo(
    () => (provider ? unavailableProviderChoices([provider.provider], catalog?.accounts, defaultAccount) : [])
      .filter((item) => !provider?.accounts.some((entry) => entry.key === item.key)),
    [provider, catalog, defaultAccount],
  );
  const recent = useMemo(() => recentPicks(recents ?? [], providers), [recents, providers]);
  const AccountRows = accountUsage ? MachinePickerAccountRows : PickerAccountRows;
  const loadingModels = !!provider && !!catalog?.pending?.includes(provider.provider);
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
        {ownAgents ? (
          <SegmentedControl<Tab>
            label={copy("Görünüm", "View")}
            hideLabel
            value={activeTab}
            options={[
              { value: "model", label: copy("Model", "Model") },
              {
                value: "agents",
                label: agentCount
                  ? copy("Ajanlar ({p0})", "Agents ({p0})", { p0: agentCount })
                  : copy("Ajanlar", "Agents"),
              },
            ]}
            onChange={setTab}
          />
        ) : null}
        {activeTab === "agents" ? (
          <View style={{ gap: space.lg }}>
            <DelegationFields
              candidates={candidates}
              imageChoices={images}
              settings={settings}
              disabled={disabled || unavailableAccount}
              onChange={(next) => onChange(model, next)}
            />
            {delegationItems.map(field(!!sparseSettings))}
          </View>
        ) : (
          <>
            {choice ? (
              // The current choice leads, with its effort controls right under it.
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <ProviderAccountMark provider={choice.provider} color={choice.color} size={22} />
                <View style={uiStyles.grow}>
                  <Body selectable={false} style={uiStyles.label}>
                    {(current?.variants ? current.label : selected?.name) ?? (model || copy("Model seç…", "Select model…"))}
                  </Body>
                  <Body selectable={false} muted style={uiStyles.caption}>
                    {[providerName(choice.provider), currentAccount].filter(Boolean).join(" · ")}
                  </Body>
                </View>
              </View>
            ) : null}
            {effortVariants ? (
              <SettingField
                key="effort-variants"
                setting={effortVariants}
                value={effortVariants.value}
                disabled={disabled || unavailableAccount}
                // Another effort is the sibling catalogue entry; the other settings stay.
                onChange={(id) => (id === model ? undefined : onChange(id, settings))}
              />
            ) : null}
            {settingRows.map(field())}
            <View style={{ gap: space.sm }}>
              {searchable ? (
                <SearchField
                  label={copy("Model ara", "Search models")}
                  value={search}
                  onChangeText={setSearch}
                />
              ) : null}
              {searching ? (
                results.length ? (
                  results.map((section) => (
                    <View key={section.key}>
                      <GroupHeading
                        title={section.account.title}
                        icon={<ProviderAccountMark provider={section.account.choice.provider} color={section.account.choice.color} size={18} />}
                      />
                      {list(section.account, section.groups, true)}
                    </View>
                  ))
                ) : (
                  <Empty compact title={copy("Eşleşen model yok.", "No matching models.")} />
                )
              ) : (
                <>
                  <PickerRecents
                    picks={unavailableAccount ? recent.filter((item) => !item.account.own) : recent}
                    disabled={disabled}
                    onPick={(item) => pick(item.account.choice, item.model)}
                  />
                  {providers.length > 1 && provider ? (
                    <FilterChipRow
                      label={copy("Sağlayıcı", "Provider")}
                      value={provider.provider}
                      options={providers.map((item) => ({ value: item.provider, label: item.title }))}
                      onChange={(next) => {
                        setBrowseProvider(next);
                        setBrowseAccount(undefined);
                      }}
                    />
                  ) : null}
                  {provider && account && provider.accounts.length + unavailable.length > 1 ? (
                    <AccountRows
                      accounts={provider.accounts}
                      unavailable={unavailable}
                      browsed={account.key}
                      onBrowse={chooseAccount}
                    />
                  ) : null}
                  {account && accountEntries ? list(account, account.groups, false) : null}
                  {listedModels ? null : (
                    <Empty
                      compact
                      title={loadingModels
                        ? copy("Modeller yükleniyor…", "Loading models…")
                        : provider && provider.provider === choice?.provider
                          ? copy("Bu hesabın modelleri yüklenemedi.", "This account's models could not be loaded.")
                          : copy("Kullanılabilir model yok.", "No models available.")}
                    />
                  )}
                </>
              )}
            </View>
            {extra}
            {groups.map(({ group, items }) => (
              <Disclosure key={group} label={label(SETTING_GROUP_TITLE[group])}>
                <View style={{ gap: space.lg }}>{items.map(field())}</View>
              </Disclosure>
            ))}
            {!ownAgents && delegationItems.length ? (
              <Disclosure label={label(SETTING_GROUP_TITLE.delegation)}>
                <View style={{ gap: space.lg }}>{delegationItems.map(field(!!sparseSettings))}</View>
              </Disclosure>
            ) : null}
          </>
        )}
      </View>
    </Sheet>
  );
}
