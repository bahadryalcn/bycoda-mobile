import { useInboxLocalScope } from "./inbox-local-scope";
import { useMobileTheme } from "@/ui/theme";
import { type Href } from "expo-router";
import { useActiveMachine } from "@/state/machines";
import { SearchField, useCollapsibleSearch } from "@/ui/search-field";
import { View } from "react-native";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import GitPullRequest from "lucide-react-native/icons/git-pull-request";
import Kanban from "lucide-react-native/icons/square-kanban";
import Plug from "lucide-react-native/icons/plug";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { ActionMenu, Button, QueryState, Sheet, StateView, StatusLine } from "@/ui/primitives";
import { useReadRetryNotice } from "@/ui/query-state";
import { useCopy } from "@/ui/copy";
import { RECORD_ACCESS_UNAVAILABLE } from "@/ui/record-access-copy";
import { getQueryPresentation } from "@/ui/query-presentation";
import { ScreenList } from "@/ui/screen-list";
import { ProviderConnections, ProviderInboxFeedback, ProviderInboxRow } from "./provider-list";
import { inboxItemKey, isInboxPrivateFailure, providerInboxAccess } from "./provider-model";
import type { ProviderInboxBrowseProps } from "./provider-component-types";
import { useInboxRead, useProviderInboxAvailability } from "./provider-queries";
import { inboxBrowseReducer, initialInboxBrowseState, type InboxBrowseAction } from "./provider-state";
import { useInboxBrowseMemory } from "./inbox-browse-memory-provider";
import { useInboxScrollMemory } from "./use-inbox-scroll-memory";
import { applyInboxView, inboxActiveFilters, inboxFetchState, normalizeInboxView, type InboxView } from "./provider-view-model";
import { InboxFilterFields } from "./inbox-filter-fields";
import { inboxPage, inboxRecordHref } from "./inbox-record-route";
import { space } from "@/ui/tokens";
import { pushOnce } from "@/ui/navigation";

export { type ProviderInboxBrowseProps } from "./provider-component-types";

export function ProviderInboxBrowse({ origin, embedded = false, openJira = false }: ProviderInboxBrowseProps & { openJira?: boolean }) {
  const inboxScope = useInboxLocalScope();
  useMobileTheme();
  const copy = useCopy(), machine = useActiveMachine();
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // An explicit refresh asks every provider again; other reads accept the desktop's recent list.
  const refreshNext = useRef(false);
  const memory = useInboxBrowseMemory();
  const [initialView] = useState(() => memory?.read(origin));
  const [browse, reduce] = useReducer(inboxBrowseReducer, initialView?.preferences,
    preferences => ({ ...initialInboxBrowseState, ...preferences }));
  const { assigned, search, committedSearch, limit } = browse;
  const listView = useMemo(() => normalizeInboxView(browse.view), [browse.view]);
  const availability = useProviderInboxAvailability();
  const scopeCurrent = inboxScope.matches(origin);
  const readAllowed = scopeCurrent && providerInboxAccess(availability).canRead;
  // The desktop's rule: no status chosen reads every state; Closed or Merged need every state too.
  const readAll = inboxFetchState(listView.statuses) === "all";
  const providers = useInboxRead<"providers">({ action: "providers", input: {} }, readAllowed);
  // A new search or filter keeps the project's last rows on screen (marked Refreshing) instead of a placeholder.
  const items = useInboxRead<"list">({ action: "list", input: {
    ...(origin.projectId ? { projectId: origin.projectId } : {}),
    query: { assignedToMe: assigned, state: readAll ? "all" : "open", search: committedSearch },
  } }, readAllowed, { keepPrevious: (previous) => (previous.projectId ?? null) === origin.projectId, refreshNext });
  const privateRead = [items, providers].find(query => isInboxPrivateFailure(query.error));
  const available = readAllowed && !isInboxPrivateFailure(availability.error) && !privateRead;
  const lease = useMemo(() => ({ active: false }), [available]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  const serviceLease = useMemo(() => ({ active: false }), [connectionsOpen]);
  useLayoutEffect(() => { serviceLease.active = true; return () => { serviceLease.active = false; }; }, [serviceLease]);
  const viewKey = JSON.stringify([assigned, readAll, committedSearch, limit]);
  const latest = useRef({ available, readAllowed, items, providers, availability, viewKey });
  latest.current = { available, readAllowed, items, providers, availability, viewKey };
  const current = useCallback(() => mounted.current && (!memory || memory.read(origin) !== undefined) && inboxScope.matches(origin), [memory, origin.machineId, origin.projectId, inboxScope.matches]);
  const canBrowse = useCallback(() => lease.active && current() && latest.current.available, [lease, current]);
  function refresh() {
    if (!current()) return;
    const state = latest.current;
    if (state.readAllowed) refreshNext.current = true;
    return Promise.all([state.availability.refetch(), ...(state.readAllowed ? [state.providers.refetch(), state.items.refetch()] : [])]);
  }
  function retryItems() {
    if (!current()) return;
    const state = latest.current;
    if (!state.readAllowed) return state.availability.refetch();
    if (!state.items.isFetching) { refreshNext.current = true; return state.items.refetch(); }
  }
  function retryProviders() {
    if (!current()) return;
    const state = latest.current;
    if (!state.readAllowed) return state.availability.refetch();
    if (!state.providers.isFetching) return state.providers.refetch();
  }
  function manageConnections() {
    if (!serviceLease.active || !connectionsOpen || !current()) return;
    setConnectionsOpen(false); pushOnce("/machines");
  }
  const scopedAvailability = { ...availability, isEnabled: available, isSuccess: available && availability.isSuccess,
    error: availability.error ?? privateRead?.error ?? null, refetch: refresh };
  const allRows = useMemo(() => available ? items.data?.items ?? [] : [], [available, items.data]);
  const visible = useMemo(() => applyInboxView(allRows, listView), [allRows, listView]);
  const rows = visible.slice(0, limit);
  const activeFilters = inboxActiveFilters(listView, assigned);
  const hasFilters = activeFilters > 0;
  const searching = committedSearch.length > 0;
  const awaitingSearch = search.trim() !== committedSearch;
  const empty = !awaitingSearch && !!items.data && visible.length === 0 &&
    Object.keys(items.data.errors).length === 0 && !items.data.omittedProjects?.length;
  // Shown rows stay while a new read runs; one quiet line says so (the placeholder is for a first load only).
  const refreshing = available && items.data !== undefined && items.isFetching;
  // The desktop fetches every connected repository before it answers; say so instead of a mute placeholder.
  const slowList = useReadRetryNotice(available && items.data === undefined && items.isFetching && !items.error &&
    (items.failureCount ?? 0) === 0, origin.machineId);
  const scrollMemory = useInboxScrollMemory<(typeof rows)[number]>(memory, origin, initialView?.offset ?? 0,
    available && items.data !== undefined, rows.length, { suspended: !available });
  const dispatch = useCallback((action: InboxBrowseAction) => {
    if (action.type === "close" ? !mounted.current : !canBrowse()) return;
    if (action.type !== "commit-search") scrollMemory.cancelRestore();
    reduce(action);
  }, [scrollMemory.cancelRestore, canBrowse]);
  const clearFilters = { label: copy("Filtreleri temizle", "Clear filters"), onPress: () => dispatch({ type: "clear-filters" }) };
  const clearSearch = { label: copy("Aramayı temizle", "Clear search"), onPress: () => dispatch({ type: "clear-search" }) };
  useLayoutEffect(() => { memory?.remember(origin, browse); },
    [memory, origin.machineId, origin.projectId, assigned, search, committedSearch, limit, browse.view]);
  const setView = (next: Partial<InboxView>) => dispatch({ type: "view", view: next });
  // Search and every filter share the one sheet; each choice applies at once, like the desktop menu.
  const collection = useCollapsibleSearch(<SearchField label={copy("Ara", "Search")} value={search}
    onChangeText={value => dispatch({type:"search",value})} autoCorrect={false} placeholder={copy("Issue veya PR ara", "Search issues or PRs")} />, {
    activeFilters,
    onResetFilters: () => dispatch({ type: "clear-filters" }),
    // The desktop Inbox filter menu's set, shared with the Pull requests list.
    filters: <InboxFilterFields rows={allRows} view={listView} onChange={setView} assigned={assigned}
      onAssigned={value => dispatch({ type: "filter", key: "assigned", value })} />,
  });
  useEffect(() => {
    if (!available) return;
    const timer = setTimeout(() => dispatch({ type: "commit-search", value: search.trim() }), 350);
    return () => clearTimeout(timer);
  }, [search, dispatch, available]);
  // A link to the Inbox's Jira view (`view=jira`) opens the Jira boards page once.
  const jiraLinkOpened = useRef(false);
  useEffect(() => {
    if (!openJira || jiraLinkOpened.current || !origin.projectId || !machine?.capabilities?.includes("inbox.jiraBoard.v1")) return;
    jiraLinkOpened.current = true;
    pushOnce(jiraBoardsHref(origin));
  }, [openJira, origin.projectId, machine]);
  const accessMessage = copy(...RECORD_ACCESS_UNAVAILABLE);
  const unavailableWithoutCause = scopeCurrent && !readAllowed && !availability.error && availability.data?.available === true && getQueryPresentation(availability) === "ready";
  const accessFeedback = <>
    {!scopeCurrent || unavailableWithoutCause ? <>
      <StateView tone="warning" title={copy("Bağlantı bekleniyor", "Waiting for a connection")} description={accessMessage}
        action={unavailableWithoutCause ? { label: copy("Yenile","Refresh"), onPress: () => { void refresh(); } } : undefined} />
    </> : <QueryState query={{...availability, refetch: refresh}}
      empty={availability.data?.available === false} emptyIllustration="connect-computer" emptyTitle={copy("Bilgisayardaki Bycoda açık olmalı", "Open Bycoda on your computer")}
      emptyDetail={copy("GitHub, GitLab, Azure DevOps, Linear ve Jira erişimi bilgisayardaki oturumundan alınır. Bycoda’yı aç veya güncelle; bağlantı otomatik kontrol edilir.",
        "Provider access uses your desktop session. Open or update Bycoda on this computer; availability is checked automatically.")}
      emptyAction={{ label: copy("Yeniden dene", "Retry"), busy: availability.isFetching, onPress: () => { void refresh(); } }}
      onManageConnections={connectionsOpen ? manageConnections : undefined} />}
    {scopeCurrent && readAllowed && privateRead ? <QueryState query={{...privateRead, data: undefined, refetch: refresh}}
      onManageConnections={connectionsOpen ? manageConnections : undefined} /> : null}
  </>;
  // A record opens as its own pushed page; native Back and the swipe return to this list.
  const openRecord = (item: (typeof rows)[number]) => {
    if (!canBrowse() || latest.current.viewKey !== viewKey) return;
    pushOnce(inboxRecordHref(item, origin));
  };
  return <>
    <ScreenList {...scrollMemory.listProps} title={embedded ? undefined : copy("Servis gelen kutusu", "Provider inbox")}
      query={available ? items : scopedAvailability} refresh={refresh}
      data={rows} keyExtractor={inboxItemKey} renderItem={({item}) => <ProviderInboxRow item={item} onOpen={openRecord} />}
      footer={available && visible.length > limit ? <Button tone="quiet" label={copy("Daha fazla göster", "Show more")}
        onPress={() => dispatch({type:"more"})} /> : undefined}
      header={<>
        {!connectionsOpen ? accessFeedback : null}
        {available ? <>
          {/* Search, filters and more trail the row. The provider choice (with its counts) lives in the
              filter sheet only; an applied one shows as the dot on the filter icon. */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space.xs }}>
            {collection.trigger}
            {collection.filterTrigger}
            {/* The top-row menu: where to go from here (Jira boards, Pull requests, connected services),
                then Refresh for those who cannot pull. Clearing filters lives in the filter sheet. */}
            <ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
              machine?.capabilities?.includes("inbox.jiraBoard.v1") && {
                key: "jira-boards",
                group: "navigate",
                label: copy("Jira panoları", "Jira boards"),
                detail: origin.projectId ? undefined : copy("Jira için proje seç", "Select a project for Jira"),
                disabled: !origin.projectId,
                opens: true,
                icon: <Kanban />,
                onPress: () => { if (canBrowse() && origin.projectId) pushOnce(jiraBoardsHref(origin)); },
              },
              { key: "pull-requests", group: "navigate", label: copy("Pull request’ler", "Pull requests"), icon: <GitPullRequest />, opens: true,
                onPress: () => { if (canBrowse()) pushOnce("/pull-requests" as Href); } },
              { key: "connections", group: "navigate", label: copy("Bağlı servisler","Connected services"), icon: <Plug />, opens: true, onPress: () => { if (canBrowse()) setConnectionsOpen(true); } },
              { key: "refresh", label: copy("Yenile","Refresh"), icon: <RefreshCw />, disabled: items.isFetching, onPress: () => { void retryItems(); } },
            ]} />
          </View>
          {refreshing ? <StatusLine busy label={copy("Yenileniyor…", "Refreshing…")} /> : null}
          {slowList ? <StatusLine busy label={copy("Bilgisayarındaki Bycoda kayıtları servislerden almaya devam ediyor…",
            "Bycoda on your computer is still fetching from your services…")} /> : null}
          <QueryState query={{...items,refetch:retryItems}} empty={empty} searching={searching || hasFilters} emptyIllustration="inbox-empty"
            noResults={{ searching, filtered: hasFilters, onClearSearch: clearSearch.onPress, onClearFilters: clearFilters.onPress }}
            emptyTitle={searching ? copy("Eşleşen sonuç yok", "No matching results") : hasFilters
              ? copy("Bu filtrede kayıt yok", "No items match these filters") : readAll ? copy("Kayıt yok", "No items") : copy("Açık kayıt yok", "No open items")}
            emptyAction={searching ? clearSearch : hasFilters ? clearFilters : undefined} />
          {items.data ? <ProviderInboxFeedback result={items.data} retrying={items.isFetching} onRetry={retryItems} /> : null}
        </> : null}
      </>} />
    {connectionsOpen ? <Sheet visible size="compact" title={copy("Bağlı servisler","Connected services")} onClose={() => setConnectionsOpen(false)}>
      {accessFeedback}
      {available ? <>
        <QueryState query={{...providers,refetch:retryProviders}} onManageConnections={manageConnections} />
        {providers.data ? <ProviderConnections providers={providers.data} retrying={providers.isFetching} onRetry={retryProviders} /> : null}
      </> : null}
    </Sheet> : null}
    {available ? collection.sheet : null}
  </>;
}

function jiraBoardsHref(origin: { machineId: string; projectId: string | null }): Href {
  return inboxPage({ pathname: "/inbox/jira", params: { machineId: origin.machineId, projectId: origin.projectId ?? "" } });
}
