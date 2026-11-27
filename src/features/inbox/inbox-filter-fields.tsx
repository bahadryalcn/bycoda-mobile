import { useMemo } from "react";
import type { RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
import { FilterChipRow } from "@/ui/filter-sheet";
import { MultiSelectField, NavigationGroup, SectionHeader, ToggleField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { providerName } from "./provider-model";
import {
  inboxFilterOptions,
  narrowInbox,
  providerCounts,
  PULL_REQUEST_PROVIDERS,
  type InboxStatusCategory,
  type InboxView,
} from "./provider-view-model";

/**
 * The one search-and-filter sheet body for provider records: the Inbox and the Pull requests list
 * show the desktop Inbox filter menu's set in the same order and words. Every choice applies at
 * once. Trackers get their own dimensions (Jira assignee and workflow status, Linear teams and
 * projects), code hosts their repositories; choices that cannot apply to the chosen provider hide.
 */
export function InboxFilterFields({ rows, view, onChange, assigned, onAssigned, pullRequestsOnly = false }: {
  /** Every row the read returned; options and counts are read from them. */
  rows: readonly RemoteInboxItem[];
  view: InboxView;
  onChange: (next: Partial<InboxView>) => void;
  assigned: boolean;
  onAssigned: (value: boolean) => void;
  pullRequestsOnly?: boolean;
}) {
  const copy = useCopy();
  const locale = useLocale();
  const count = (value: number) => new Intl.NumberFormat(locale).format(value);
  const narrowed = useMemo(() => narrowInbox(rows, view), [rows, view]);
  const counts = useMemo(() => providerCounts(narrowed), [narrowed]);
  const options = useMemo(() => inboxFilterOptions(rows, view, copy("Proje yok", "No project")), [rows, view, copy]);
  const provider = view.provider;
  const tracker = provider === "jira" || provider === "linear";
  const providerOptions: { value: InboxView["provider"]; label: string }[] = [
    { value: "all", label: `${copy("Tümü", "All")} ${count(narrowed.length)}` },
    ...counts.filter((entry) => !pullRequestsOnly || PULL_REQUEST_PROVIDERS.includes(entry.provider))
      .map(({ provider: name, count: total }) => ({ value: name, label: `${providerName(name)} ${count(total)}` })),
  ];
  // The chosen provider stays a chip even when this read returned none of its rows.
  if (provider !== "all" && !providerOptions.some((option) => option.value === provider))
    providerOptions.push({ value: provider, label: `${providerName(provider)} 0` });
  const statusOptions: { value: InboxStatusCategory; label: string }[] = [
    { value: "open", label: copy("Açık", "Open") }, { value: "closed", label: copy("Kapalı", "Closed") },
    ...(tracker ? [] : [{ value: "draft" as const, label: copy("Taslak", "Draft") }, { value: "merged" as const, label: copy("Birleştirildi", "Merged") }]),
  ];
  const showRepos = !tracker && options.repos.length > 1;
  return <>
    <SectionHeader title={copy("Servis", "Provider")} />
    <FilterChipRow wrap label={copy("Servis", "Provider")} value={provider} options={providerOptions}
      // Provider-specific choices end with their provider, so no hidden filter keeps narrowing the list.
      onChange={(next) => onChange({ provider: next, teams: [], trackerProjects: [], assignees: [], unassigned: false, workflow: [],
        ...(next === "jira" || next === "linear" ? { repos: [], type: "all" } : {}) })} />
    <NavigationGroup>
      {/* GitLab and Azure DevOps read their to-dos for this choice, so the desktop names it Needs attention. */}
      <ToggleField label={provider === "gitlab" || provider === "azuredevops" ? copy("İlgi bekleyenler", "Needs attention") : copy("Bana atananlar", "Assigned to me")}
        value={assigned} onChange={onAssigned} />
      {provider === "jira" ? <ToggleField label={copy("Atanmamış", "Unassigned")} value={view.unassigned}
        onChange={(unassigned) => onChange({ unassigned })} /> : null}
    </NavigationGroup>
    {provider === "jira" && (options.assignees.length || view.assignees.length) ? <MultiSelectField label={copy("Atanan", "Assignee")}
      options={options.assignees} values={view.assignees} onChange={(assignees) => onChange({ assignees })} /> : null}
    {provider === "jira" && options.workflow.length ? <MultiSelectField label={copy("İş akışı durumu", "Workflow status")}
      options={options.workflow} values={view.workflow} onChange={(workflow) => onChange({ workflow })} /> : null}
    <MultiSelectField label={provider === "jira" ? copy("Durum kategorisi", "Status category") : copy("Durum", "Status")}
      options={statusOptions} values={view.statuses.filter((status) => statusOptions.some((option) => option.value === status))}
      onChange={(statuses) => onChange({ statuses })} />
    {!pullRequestsOnly && !tracker ? <>
      <SectionHeader title={copy("Tür", "Type")} />
      <FilterChipRow wrap label={copy("Tür", "Type")} value={view.type} onChange={(type) => onChange({ type })} options={[
        { value: "all", label: copy("Tümü", "All") }, { value: "issue", label: copy("Issue’lar", "Issues") },
        { value: "pr", label: provider === "gitlab" ? copy("Merge request’ler", "Merge requests") : copy("Pull request’ler", "Pull requests") }]} />
    </> : null}
    {tracker && options.teams.length ? <MultiSelectField label={provider === "linear" ? copy("Ekipler", "Teams") : copy("Projeler", "Projects")}
      options={options.teams} values={view.teams} onChange={(teams) => onChange({ teams })} /> : null}
    {provider === "linear" && options.trackerProjects.length ? <MultiSelectField label={copy("Projeler", "Projects")}
      options={options.trackerProjects} values={view.trackerProjects} onChange={(trackerProjects) => onChange({ trackerProjects })} /> : null}
    {showRepos ? <MultiSelectField label={copy("Depolar", "Repositories")} options={options.repos} values={view.repos}
      onChange={(repos) => onChange({ repos })} /> : null}
    <SectionHeader title={copy("Güncellenme", "Updated")} />
    <FilterChipRow wrap label={copy("Güncellenme", "Updated")} value={view.time} onChange={(time) => onChange({ time })} options={[
      { value: "all", label: copy("Tüm zamanlar", "All time") }, { value: "today", label: copy("Bugün", "Today") },
      { value: "7d", label: copy("Son 7 gün", "Last 7 days") }, { value: "30d", label: copy("Son 30 gün", "Last 30 days") }]} />
    <SectionHeader title={copy("Sırala", "Sort")} />
    <FilterChipRow wrap label={copy("Sırala", "Sort")} value={view.sort} onChange={(sort) => onChange({ sort })} options={[
      { value: "updated", label: copy("Son güncellenen", "Recently updated") }, { value: "title", label: copy("Başlık", "Title") }]} />
  </>;
}
