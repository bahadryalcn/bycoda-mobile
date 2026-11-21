import { InboxLocalScopeContext, useInboxLocalScope } from "./inbox-local-scope";
import { useMobileTheme } from "@/ui/theme";
import { router } from "expo-router";
import { useActiveMachine } from "@/state/machines";
import { ProviderJiraBoards } from "./jira-board-screen";
import { AppliedFilters, FilterButton, FilterSheet } from "@/ui/filter-sheet";
import { SearchField, SearchToolbar } from "@/ui/search-field";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { ActionMenu, Button, Notice, QueryState, Sheet, StateView, ToggleField, NavigationGroup } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { RECORD_ACCESS_UNAVAILABLE } from "@/ui/record-access-copy";
import { useLocale } from "@/i18n";
import { getQueryPresentation } from "@/ui/query-presentation";
import { Scope } from "../management/common";
import { ProviderInboxDetail } from "./provider-detail";
import { ScreenList } from "@/ui/screen-list";
import { ProviderConnections, ProviderInboxFeedback, ProviderInboxRow } from "./provider-list";
import { inboxItemKey, isInboxPrivateFailure, providerInboxView } from "./provider-model";
import type { ProviderInboxBrowseProps } from "./provider-component-types";
import { useInboxRead, useProviderInboxAvailability } from "./provider-queries";
import { inboxBrowseReducer, initialInboxBrowseState, type InboxBrowseAction } from "./provider-state";
import { useInboxBrowseMemory } from "./inbox-browse-memory-provider";
import { useInboxScrollMemory } from "./use-inbox-scroll-memory";

export { type ProviderInboxBrowseProps } from "./provider-component-types";
type Filters = { assigned: boolean; all: boolean };

export function ProviderInboxBrowse({ origin, embedded = false, openJira = false }: ProviderInboxBrowseProps & { openJira?: boolean }) {
  const inboxScope = useInboxLocalScope();
  useMobileTheme();
  const copy = useCopy(), machine = useActiveMachine();
  const locale = useLocale();
  const [jiraBoards, setJiraBoards] = useState(openJira && !!origin.projectId);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState<Filters | null>(null);
  const filterOwner = useRef(filterDraft); filterOwner.current = filterDraft;
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; filterOwner.current = null; }; }, []);
  const memory = useInboxBrowseMemory();
  const [initialView] = useState(() => memory?.read(origin));
  const [browse, reduce] = useReducer(inboxBrowseReducer, initialView?.preferences,
    preferences => ({ ...initialInboxBrowseState, ...preferences }));
  const { assigned, all, search, committedSearch, selected, limit, notice } = browse;
  const availability = useProviderInboxAvailability();
  const view = providerInboxView(selected, availability);
  const scopeCurrent = inboxScope.matches(origin);
  const readAllowed = scopeCurrent && view.canRead;
  const providers = useInboxRead<"providers">({ action: "providers", input: {} }, readAllowed);
  const items = useInboxRead<"list">({ action: "list", input: {
    ...(origin.projectId ? { projectId: origin.projectId } : {}),
    query: { assignedToMe: assigned, state: all ? "all" : "open", search: committedSearch },
  } }, readAllowed);
  const privateRead = [items, providers].find(query => isInboxPrivateFailure(query.error));
  const available = readAllowed && !isInboxPrivateFailure(availability.error) && !privateRead;
  const lease = useMemo(() => ({ active: false }), [available]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  const serviceLease = useMemo(() => ({ active: false }), [connectionsOpen]);
  useLayoutEffect(() => { serviceLease.active = true; return () => { serviceLease.active = false; }; }, [serviceLease]);
  const viewKey = JSON.stringify([assigned, all, committedSearch, limit]);
  const latest = useRef({ available, readAllowed, items, providers, availability, viewKey });
  latest.current = { available, readAllowed, items, providers, availability, viewKey };
  const current = useCallback(() => mounted.current && (!memory || memory.read(origin) !== undefined) && inboxScope.matches(origin), [memory, origin.machineId, origin.projectId, inboxScope.matches]);
  const canBrowse = useCallback(() => lease.active && current() && latest.current.available, [lease, current]);
  function refresh() {
    if (!current()) return;
    const state = latest.current;
    return Promise.all([state.availability.refetch(), ...(state.readAllowed ? [state.providers.refetch(), state.items.refetch()] : [])]);
  }
  function retryItems() {
    if (!current()) return;
    const state = latest.current;
    if (!state.readAllowed) return state.availability.refetch();
    if (!state.items.isFetching) return state.items.refetch();
  }
  function retryProviders() {
    if (!current()) return;
    const state = latest.current;
    if (!state.readAllowed) return state.availability.refetch();
    if (!state.providers.isFetching) return state.providers.refetch();
  }
  function manageConnections() {
    if (!serviceLease.active || !connectionsOpen || !current()) return;
    setConnectionsOpen(false); router.push("/machines");
  }
  const scopedAvailability = { ...availability, isEnabled: available, isSuccess: available && availability.isSuccess,
    error: availability.error ?? privateRead?.error ?? null, refetch: refresh };
  const rows = available ? items.data?.items.slice(0, limit) ?? [] : [];
  const empty = items.data?.items.length === 0 && Object.keys(items.data.errors).length === 0;
  const hasFilters = assigned || all;
  const searching = search.trim().length > 0;
  const scrollMemory = useInboxScrollMemory<(typeof rows)[number]>(memory, origin, initialView?.offset ?? 0,
    available && items.data !== undefined, rows.length, { suspended: !available });
  const dispatch = useCallback((action: InboxBrowseAction) => {
    if (action.type === "close" ? !mounted.current : !canBrowse()) return;
    if (action.type !== "commit-search") scrollMemory.cancelRestore();
    reduce(action);
  }, [scrollMemory.cancelRestore, canBrowse]);
  const clearFilters = { label: copy("Filtreleri temizle", "Clear filters"), onPress: () => dispatch({ type: "clear-filters" }) };
  const closeFilters = () => { filterOwner.current = null; setFilterDraft(null); };
  const changeFilters = (next: Filters) => { filterOwner.current = next; setFilterDraft(next); };
  useLayoutEffect(() => { if (!available) closeFilters(); }, [available]);
  useLayoutEffect(() => { memory?.remember(origin, browse); },
    [memory, origin.machineId, origin.projectId, assigned, all, search, committedSearch, limit]);
  useEffect(() => {
    if (!available || selected) return;
    const timer = setTimeout(() => dispatch({ type: "commit-search", value: search.trim() }), 350);
    return () => clearTimeout(timer);
  }, [search, dispatch, available, selected]);
  const accessMessage = copy(...RECORD_ACCESS_UNAVAILABLE);
  const unavailableWithoutCause = scopeCurrent && !readAllowed && !availability.error && availability.data?.available === true && getQueryPresentation(availability) === "ready";
  const accessFeedback = <>
    {!scopeCurrent || unavailableWithoutCause ? <>
      <StateView illustration="unreachable" title={copy("Bağlantı bekleniyor", "Waiting for a connection")} description={accessMessage} />
      {unavailableWithoutCause ? <Button tone="quiet" label={copy("Yenile","Refresh")} onPress={()=>{void refresh();}} /> : null}
    </> : <QueryState query={{...availability, refetch: refresh}}
      empty={availability.data?.available === false} emptyIllustration="connect-computer" emptyTitle={copy("Bilgisayardaki Bycoda açık olmalı", "Open Bycoda on your computer")}
      emptyDetail={copy("GitHub, GitLab, Azure DevOps, Linear ve Jira erişimi bilgisayardaki oturumundan alınır. Bycoda’yı aç veya güncelle; bağlantı otomatik kontrol edilir.",
        "Provider access uses your desktop session. Open or update Bycoda on this computer; availability is checked automatically.")}
      emptyAction={{ label: copy("Yeniden dene", "Retry"), busy: availability.isFetching, onPress: () => { void refresh(); } }}
      onManageConnections={connectionsOpen ? manageConnections : undefined} />}
    {scopeCurrent && readAllowed && privateRead ? <QueryState query={{...privateRead, data: undefined, refetch: refresh}}
      onManageConnections={connectionsOpen ? manageConnections : undefined} /> : null}
  </>;
  return <>
    {view.kind === "detail" ? <Sheet visible size="full" scroll={false} title={copy("Ayrıntılar", "Details")} onClose={() => dispatch({type:"close"})}>
      <InboxLocalScopeContext value={inboxScope}>
        <ProviderInboxDetail key={inboxItemKey(view.item)} item={view.item} origin={origin} availability={scopedAvailability}
          onClose={message => dispatch({type:"close",notice:message})} />
      </InboxLocalScopeContext>
    </Sheet> : null}
    {jiraBoards ? <ProviderJiraBoards origin={origin} canRead={available} canWrite={available} onClose={() => setJiraBoards(false)} /> : null}
    <ScreenList {...scrollMemory.listProps} title={embedded ? undefined : copy("Servis gelen kutusu", "Provider inbox")}
      query={available ? items : scopedAvailability} refresh={refresh} context={<Scope allowAll projectId={origin.projectId} onChange={inboxScope.setProjectId} />}
      data={rows} keyExtractor={inboxItemKey} renderItem={({item}) => <ProviderInboxRow item={item} onOpen={item => {
        if (canBrowse() && latest.current.viewKey === viewKey) dispatch({type:"select",item});
      }} />}
      footer={available && (items.data?.items.length ?? 0) > limit ? <Button tone="quiet" label={copy("Daha fazla göster", "Show more")}
        onPress={() => dispatch({type:"more"})} /> : undefined}
      header={<>
        {available && notice ? <Notice tone="success" message={notice} /> : null}
        {view.kind === "browse" && !connectionsOpen ? accessFeedback : null}
        {available ? <>
          {machine?.capabilities?.includes("inbox.jiraBoard.v1") ? <Button tone="quiet" flush
            label={origin.projectId ? copy("Jira panoları", "Jira boards") : copy("Jira için proje seç", "Select a project for Jira")}
            disabled={!origin.projectId} onPress={() => { if (canBrowse() && origin.projectId) setJiraBoards(true); }} /> : null}
          <SearchToolbar search={<SearchField label={copy("Ara", "Search")} value={search}
            onChangeText={value => dispatch({type:"search",value})} autoCorrect={false} placeholder={copy("Issue veya PR ara", "Search issues or PRs")} />}
            actions={<>
              <FilterButton count={Number(assigned)+Number(all)} onPress={() => { if(canBrowse()) changeFilters({assigned,all}); }} />
              <ActionMenu label={copy("Diğer işlemler", "More actions")} busy={items.isFetching && items.data !== undefined} actions={[
                {key:"connections",label:copy("Bağlı servisler","Connected services"),onPress:()=>{if(canBrowse())setConnectionsOpen(true);}},
                {key:"refresh",label:copy("Yenile","Refresh"),disabled:items.isFetching,onPress:()=>{void retryItems();}},
              ]} />
            </>} />
          <AppliedFilters result={items.data ? copy("Kayıtlar: {p0}", "Items: {p0}", { p0: new Intl.NumberFormat(locale).format(items.data.items.length) }) : undefined}
            filters={[assigned&&copy("Yalnız bana atananlar","Assigned to me only"),all&&copy("Kapalı kayıtları da göster","Include closed items")]} />
          {hasFilters && !empty ? <Button tone="quiet" {...clearFilters} /> : null}
          <QueryState query={{...items,refetch:retryItems}} empty={empty} searching={searching || hasFilters} emptyIllustration="inbox-empty"
            emptyTitle={hasFilters ? copy("Bu filtrede kayıt yok", "No items match these filters") : searching
              ? copy("Eşleşen sonuç yok", "No matching results") : copy("Açık kayıt yok", "No open items")}
            emptyAction={hasFilters ? clearFilters : undefined} />
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
    {filterDraft && available ? <FilterSheet visible onClose={()=>{if(filterOwner.current===filterDraft)closeFilters();}}
      onReset={()=>{if(canBrowse()&&filterOwner.current===filterDraft)changeFilters({assigned:false,all:false});}}
      onApply={()=>{
        if(!canBrowse()||filterOwner.current!==filterDraft)return;
        filterOwner.current=null;dispatch({type:"filter",key:"assigned",value:filterDraft.assigned});
        dispatch({type:"filter",key:"all",value:filterDraft.all});setFilterDraft(null);
      }}>
      <NavigationGroup>
        <ToggleField label={copy("Yalnız bana atananlar","Assigned to me only")} value={filterDraft.assigned}
          onChange={assigned=>{if(canBrowse()&&filterOwner.current===filterDraft)changeFilters({...filterDraft,assigned});}} />
        <ToggleField label={copy("Kapalı kayıtları da göster","Include closed items")} value={filterDraft.all}
          onChange={all=>{if(canBrowse()&&filterOwner.current===filterDraft)changeFilters({...filterDraft,all});}} />
      </NavigationGroup>
    </FilterSheet> : null}
  </>;
}
