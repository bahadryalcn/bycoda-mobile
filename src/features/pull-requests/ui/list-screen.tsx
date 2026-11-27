import { useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useActiveMachine, useMachines } from "@/state/machines";
import { Screen, ScreenList, Stack, QueryState, Skeleton, StateView, StatusLine } from "@/ui/primitives";
import { AppliedFilters } from "@/ui/filter-sheet";
import { SearchField, useCollapsibleSearch } from "@/ui/search-field";
import { View } from "react-native";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useInboxRead, useProviderInboxAvailability } from "../../inbox/provider-queries";
import { providerInboxAccess, isInboxPrivateFailure } from "../../inbox/provider-model";
import { ProviderInboxRow, ProviderInboxFeedback } from "../../inbox/provider-list";
import { defaultPrFilters, PR_LIST_CACHE_MS, prListItems, prListKeepsPrevious, prListQuery } from "../model/list";
import { InboxFilterFields } from "../../inbox/inbox-filter-fields";
import { inboxActiveFilters, inboxFetchState, type InboxView } from "../../inbox/provider-view-model";
import { providerName } from "../../inbox/provider-model";
import { inboxRecordHref } from "../../inbox/inbox-record-route";
import { useProjectList } from "../../workspace/use-project-directory";
import { NoComputerGate } from "@/ui/no-computer";
import { useAdoptProjectScope } from "../../management/shared/local-project-scope";
import { useRequiredProjectScope } from "../../management/shared/required-project-scope";
import { ProjectScopePill } from "../../workspace/project-scope-pill";
import { pushOnce } from "@/ui/navigation";

export function PullRequestsScreen() {
  const copy = useCopy(), machine = useActiveMachine();
  const params = useLocalSearchParams<{ projectId?: string; machineId?: string }>();
  // A link for one project sets the shared selection; the list then follows the shared pill.
  useAdoptProjectScope(params.projectId || undefined, params.machineId);
  // Pull requests always belong to one project; All projects falls back to the last or most recent one.
  const scope = useRequiredProjectScope();
  const projectId = scope.projectId;
  const projects = useProjectList();
  const availability = useProviderInboxAvailability();
  // The desktop's pull-request-only Inbox: the same filter set, search and sheet as the Inbox.
  const [filters, setFilters] = useState(defaultPrFilters);
  const [searchText, setSearchText] = useState("");
  const statusLabels = { open: copy("Açık", "Open"), closed: copy("Kapalı", "Closed"), draft: copy("Taslak", "Draft"), merged: copy("Birleştirildi", "Merged") };
  const access = providerInboxAccess(availability);
  const scopeCurrent = (!params.machineId || machine?.id === params.machineId) && !!projectId && projects.isProjectVisible(projectId);
  const readAllowed = !!machine && scopeCurrent && access.canRead;
  // A provider read is a desktop round trip of several seconds: a list seen earlier stays cached
  // and is shown at once while it refreshes, and a new sort keeps the rows already on screen.
  const query = useInboxRead({ action: "list", input: { projectId: projectId ?? "", query: prListQuery(filters) } }, readAllowed, {
    gcTime: PR_LIST_CACHE_MS,
    keepPrevious: previous => prListKeepsPrevious(previous, projectId ?? ""),
  });
  // Search goes to the desktop once typing pauses, like the Inbox's.
  useEffect(() => {
    const timer = setTimeout(() => setFilters(current => current.search === searchText.trim() ? current : { ...current, search: searchText.trim() }), 350);
    return () => clearTimeout(timer);
  }, [searchText]);
  const privateFailure = isInboxPrivateFailure(query.error);
  const visible = readAllowed && !privateFailure;
  const rows = useMemo(() => visible ? query.data?.items ?? [] : [], [visible, query.data]);
  const items = useMemo(() => prListItems(rows, filters.view), [rows, filters.view]);
  const activeFilters = inboxActiveFilters(filters.view, filters.assigned);
  const setView = (next: Partial<InboxView>) => setFilters(current => ({ ...current, view: { ...current.view, ...next } }));
  const clearFilters = () => setFilters(current => ({ ...defaultPrFilters, search: current.search }));
  const collection = useCollapsibleSearch(<SearchField label={copy("Ara", "Search")} value={searchText} onChangeText={setSearchText}
    autoCorrect={false} placeholder={copy("Pull request ara", "Search pull requests")} />, {
    activeFilters,
    onResetFilters: clearFilters,
    filters: <InboxFilterFields pullRequestsOnly rows={rows} view={filters.view} onChange={setView} assigned={filters.assigned}
      onAssigned={assigned => setFilters(current => ({ ...current, assigned }))} />,
  });
  const current = () => !!machine && useMachines.getState().activeId === machine.id && scopeCurrent && !!projectId && projects.isProjectVisible(projectId);
  const refresh = () => {
    if (!current()) return;
    void availability.refetch();
    if (access.canRead) return query.refetch();
  };
  const pull = usePullRefresh(refresh);
  const searching = filters.search.length > 0;
  const filtered = activeFilters > 0;
  // Shown rows refresh quietly: one muted line instead of a placeholder (a pull shows its own spinner).
  const refreshing = visible && items.length > 0 && query.isFetching && !pull.refreshing;
  const feedback = visible && query.data ? <ProviderInboxFeedback result={query.data} onRetry={() => { void refresh(); }} retrying={query.isFetching} /> : null;
  // One owner for the list read's state: centered while there are no rows, a line above shown rows
  // (for example a refresh that keeps failing).
  const listQuery = <QueryState query={privateFailure ? { ...query, data: undefined, refetch: refresh } : query}
    empty={visible && query.data !== undefined && items.length === 0} size="region" emptyIllustration="inbox-empty"
    noResults={{ searching, filtered,
      filtersTitle: copy("Bu filtrede pull request yok", "No pull requests match these filters"),
      onClearSearch: () => { setSearchText(""); setFilters(current => ({ ...current, search: "" })); },
      onClearFilters: clearFilters }}
    emptyTitle={inboxFetchState(filters.view.statuses) === "open" ? copy("Açık pull request yok", "No open pull requests") : copy("Pull request yok", "No pull requests")}
    // GitHub, GitLab and Azure DevOps pull and merge requests are listed; issues live in the Inbox.
    emptyDetail={copy("GitHub, GitLab ve Azure DevOps pull ve merge request’leri burada listelenir. Issue’lar Gelen kutusunda.",
      "Pull and merge requests from GitHub, GitLab and Azure DevOps are listed here. Issues are in the Inbox.")}
    emptyAction={{ label: copy("Gelen kutusunu aç", "Open Inbox"),
      onPress: () => router.navigate({ pathname: "/manage/[section]", params: { section: "inbox", view: "issues" } }) }} />;
  const listState = !machine ? <NoComputerGate />
    : !scopeCurrent && (projects.verifying === true || !projectId && !projects.directoryReady && !projects.error) && (!params.machineId || machine.id === params.machineId)
      // The project is still being proven (or chosen) on a cold start; "unavailable" would only flash.
      ? <Skeleton />
      : !projectId && projects.directoryReady ? <StateView size="region" illustration="no-projects" title={copy("Bu bilgisayarda henüz proje yok.", "No projects on this computer yet.")} />
      : !scopeCurrent ? <StateView size="region" tone="warning" title={copy("Pull request erişimi kullanılamıyor", "Pull request access unavailable")}
        description={copy("Bu bağlantı başka bir bilgisayara veya artık görünmeyen bir projeye ait. Bir proje seç ya da bilgisayarı değiştir.",
          "This link belongs to another computer or a project that is no longer listed. Choose a project or switch computers.")}
        action={{ label: copy("Yeniden dene", "Retry"), onPress: () => { void projects.refetch?.(); void availability.refetch(); } }} />
      : !readAllowed ? <QueryState query={availability} size="region"
        // Without desktop provider access the list would otherwise render nothing at all.
        empty={availability.data?.available === false} emptyIllustration="connect-computer"
        emptyTitle={copy("Bilgisayardaki Bycoda açık olmalı", "Open Bycoda on your computer")}
        emptyDetail={copy("GitHub, GitLab, Azure DevOps, Linear ve Jira erişimi bilgisayardaki oturumundan alınır. Bycoda’yı aç veya güncelle; bağlantı otomatik kontrol edilir.",
          "Provider access uses your desktop session. Open or update Bycoda on this computer; availability is checked automatically.")}
        emptyAction={{ label: copy("Yeniden dene", "Retry"), busy: availability.isFetching, onPress: () => { void refresh(); } }} />
      : listQuery;
  return <Screen title={copy("Pull request’ler", "Pull requests")} scroll={false}>
    <ScreenList data={items} query={query} refreshState={pull}
      scopeControl={machine ? <ProjectScopePill allowAll={false} projectId={scope.projectId} onChange={scope.setProjectId} /> : undefined}
      // Search and the shared filter sheet trail the pill's row, as on the Inbox.
      actions={visible ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>{collection.trigger}{collection.filterTrigger}</View> : undefined}
      keyExtractor={item => `${item.projectPath}:${item.repo}:${item.number}`}
      // Empty, loading and unavailable states fill the space below the scope row and center there.
      ListEmptyComponent={listState}
      header={visible && items.length > 0 ? <Stack>
        {/* The applied state and filters read as one caption over the rows; no control row of their own. */}
        <AppliedFilters result={copy("{p0} pull request", "{p0} pull requests", { p0: String(items.length) })}
            filters={[filters.view.provider !== "all" && providerName(filters.view.provider), ...filters.view.statuses.map(status => statusLabels[status]),
              filters.assigned && copy("Bana atananlar", "Assigned to me"), filters.view.sort === "title" && `${copy("Sıra", "Sort")}: ${copy("Başlık", "Title")}`]} />
        {refreshing ? <StatusLine busy label={copy("Yenileniyor…", "Refreshing…")} /> : null}
        {listQuery}
        {feedback}
      </Stack> : feedback ?? undefined}
      renderItem={({ item }) => <ProviderInboxRow item={item} onOpen={() => {
        if (!visible || !machine || !current()) return;
        // GitHub pull requests open their deep-linkable page; GitLab and Azure DevOps ones the shared record page.
        pushOnce(inboxRecordHref(item, { machineId: machine.id, projectId }));
      }} />}
    />
    {visible ? collection.sheet : null}
  </Screen>;
}
