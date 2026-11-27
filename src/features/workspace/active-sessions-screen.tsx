import { useSnoozeNow } from "./session-clock";
import { useHostReadActive } from "@/state/queries";
import { sessionIsSnoozed } from "./session-attention-model";
import { router, Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHostQuery } from "@/state/queries";
import { NewSessionSheet } from "./new-session-sheet";
import { openNewChat } from "./new-chat-navigation";
import { useLatestCallback } from "./use-latest-callback";
import { useAsyncAction } from "@/state/actions";
import { FilterChipRow } from "@/ui/filter-sheet";
import { useLocalProjectScope } from "../management/shared/local-project-scope";
import { ProjectScopePill } from "./project-scope-pill";
import {
  QueryState,
  ScreenList,
  SearchField,
  MultiSelectField,
  useCollapsibleSearch,
  Row,
  SectionHeader,
  SelectField,
  NoResults,
  StateView,
} from "@/ui/primitives";
import { queryOwnsRegion } from "./query-region";
import { ProjectDirectoryFeedback } from "./project-directory-feedback";
import { useCopy } from "@/ui/copy";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { useProjectActivity } from "./use-project-activity";
import { SessionListRow } from "./session-list-row";
import { filterProjectSessionDirectory, listedSession, type SessionShelfId } from "./session-collection";
import { recentGlobalSessionRows, urgencyGlobalSessionRows, withPinnedGroup, type GlobalSessionRow } from "./global-session-shelves";
import { SessionShelfHeader } from "./session-shelf-header";
import { SessionFilterChip } from "./session-filter-chip";
import { HierarchyFrame, HierarchyWidthProvider } from "@/ui/hierarchy-frame";
import { View } from "react-native";
import Plus from "lucide-react-native/icons/plus";
import { IconButton } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, space } from "@/ui/tokens";
import { SwipeActionsGroup } from "@/ui/swipe-actions";
import { NoComputerState } from "@/ui/no-computer";
import { providerName } from "./provider-choices";
import {
  activeSessionFilterCount,
  defaultSessionListFilters,
  matchesSessionListFilters,
  sessionProviders,
  SESSION_TIME_FILTERS,
  type SessionListFilters,
  type SessionTimeFilter,
} from "./session-filters";

type StatusFilter = "all" | "running" | "reply";
// The project is the shared header scope, not a filter-sheet field.

export function ActiveSessionsScreen({
  initialCreate = false,
  createRequest,
  urgency = false,
  shareConnectionFeedback,
  selectedSessionId,
  onOpenSession,
}: {
  /** Opens the new-session sheet once, for a system share waiting in the launch queue. */
  initialCreate?: boolean;
  /** Changes with every warm share, so the sheet opens again on a mounted screen. */
  createRequest?: string;
  /** Tablet list column: sessions needing attention first, then running, then the rest. */
  urgency?: boolean;
  shareConnectionFeedback?: boolean;
  /** Highlights the session shown beside the list. */
  selectedSessionId?: string;
  /** Replaces the default push, e.g. to swap the detail pane in place. */
  onOpenSession?: (sessionId: string, projectId: string, machineId: string) => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const machine = useActiveMachine();
  const hydrated = useMachines((state) => state.hydrated);
  const storageError = useMachines((state) => state.storageError);
  const connectionPending = useMachines((state) => state.connectionPending);
  const activity = useProjectActivity();
  const machineId = machine?.id;
  const connection = useConnectionScope();
  const canReadCurrentProject = useLatestCallback((projectId: string) => activity.projects.isProjectVisible(projectId));
  // A queued row action stays with the connection that supplied its session IDs.
  const canReadProject = useCallback((projectId: string) => connection.isCurrent() && canReadCurrentProject(projectId), [connection, canReadCurrentProject]);
  const openCurrentSession = useLatestCallback((sessionId: string, projectId: string) => {
    if (!machineId || useMachines.getState().activeId !== machineId) return;
    if (onOpenSession) onOpenSession(sessionId, projectId, machineId);
    else router.navigate({ pathname: "/session/[id]", params: { id: sessionId, projectId, machineId } });
  });
  const openSession = useCallback((sessionId: string, projectId: string) => {
    if (canReadProject(projectId)) openCurrentSession(sessionId, projectId);
  }, [canReadProject, openCurrentSession]);
  const retry = useAsyncAction();
  const retryActivity = () => retry.run(() => activity.refetch());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [archived, setArchived] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const scope = useLocalProjectScope();
  const [listFilters, setListFilters] = useState<SessionListFilters>(defaultSessionListFilters);
  const [creating, setCreating] = useState(initialCreate);
  // Reaction to an external request (a share) arriving after this screen mounted.
  useEffect(() => {
    if (createRequest) setCreating(true);
  }, [createRequest]);
  // A tap opens the empty new session with the shared project selection; a system share keeps the
  // sheet above (it previews the shared files that go into the new session's draft).
  const newSession = () => openNewChat(scope.projectId ? { projectId: scope.projectId } : {});
  const [collapsed, setCollapsed] = useState<Partial<Record<SessionShelfId, boolean>>>({});
  const projectOptions = (activity.projects.data ?? []).map((project) => ({
    value: project.id,
    label: project.name,
    detail: project.cwd,
  }));
  // The overview follows the shared project scope; a project no longer on this computer shows all.
  const projectFilter = scope.projectId &&
    (!activity.directoryReady || projectOptions.some((project) => project.value === scope.projectId))
    ? scope.projectId : "";
  const lifecycle = useHostQuery<{ records: { sessionId: string; state: string }[] }>(
    ["sessions-lifecycle"],
    "sessions.lifecycle.list",
    {},
    { interval: 15_000 },
  );
  const settledIds = useMemo(
    () => new Set((lifecycle.data?.records ?? []).filter((r) => r.state === "settled").map((r) => r.sessionId)),
    [lifecycle.data],
  );
  const directory = activity.directory;
  const providers = sessionProviders(directory.map(({ session }) => session));
  const now = useSnoozeNow(useHostReadActive(), directory.map(({ session }) => session.snoozedUntil));
  const filtered = directory.filter(
    ({ project, session }) =>
      listedSession(session) &&
      (archived || sessionIsSnoozed(session, now) === snoozed) &&
      Boolean(session.archived) === archived &&
      matchesSessionListFilters(session, listFilters, now) &&
      (!projectFilter || project.id === projectFilter) &&
      (archived ||
        filter === "all" ||
        (filter === "reply" ? session.needsInput : session.status === "running")),
  );
  const visible = filterProjectSessionDirectory(activity.projects.data ?? [], filtered, search, copy("Yeni oturum", "New session"));
  // Desktop Last sessions shows the last seven days; archive, search and a Time filter reach older sessions.
  const windowed = !snoozed && !archived && !search.trim() && listFilters.time === "recent";
  const overviewRows = (urgency ? urgencyGlobalSessionRows : recentGlobalSessionRows)(visible, windowed ? now : undefined);
  // One project in the pill reads like the desktop project sidebar: pinned sessions lead.
  const rows: GlobalSessionRow[] = projectFilter && !search.trim() ? withPinnedGroup(overviewRows, collapsed) : overviewRows;
  const listFilterCount = activeSessionFilterCount(listFilters);
  // The project pill is the page scope, not a filter: an empty project shows its own first-use state.
  const narrowed = snoozed || !!search.trim() || (!archived && filter !== "all") || listFilterCount > 0;
  const title = copy("Oturumlar", "Sessions");
  const statusOptions = [
    { value: "all" as const, label: copy("Tümü", "All") },
    { value: "running" as const, label: copy("Çalışıyor", "Working") },
    { value: "reply" as const, label: copy("Seni bekliyor", "Needs you") },
  ];
  const timeLabels: Record<SessionTimeFilter, string> = {
    // The default window: quiet history from the last seven days plus pinned, running and waiting sessions.
    recent: copy("Son 7 gün", "Last 7 days"),
    all: copy("Tüm zamanlar", "All time"),
    today: copy("Bugün", "Today"),
    "7d": copy("Son 7 gün", "Last 7 days"),
    "30d": copy("Son 30 gün", "Last 30 days"),
  };
  const timeOptions = SESSION_TIME_FILTERS.map((value) => ({ value, label: timeLabels[value] }));
  const providerOptions = providers.map((value) => ({ value, label: providerName(value) }));
  const shownProviders = providers.filter((provider) => !listFilters.hiddenProviders.includes(provider));
  const managedLabel = copy("Asistan yönetimli", "Assistant-managed");
  const filterCount = Number(snoozed) + Number(archived) + listFilterCount;
  // Search and every session filter share the one collection sheet; choices apply live.
  const collection = useCollapsibleSearch(
    <SearchField label={copy("Oturum ara", "Search sessions")} value={search} onChangeText={setSearch} />,
    {
      activeFilters: filterCount + (!archived && filter !== "all" ? 1 : 0),
      onResetFilters: () => { setFilter("all"); setArchived(false); setSnoozed(false); setListFilters(defaultSessionListFilters); },
      filters: <>
        <SectionHeader title={copy("Durum", "Status")} />
        <FilterChipRow wrap label={copy("Durum", "Status")} value={filter} options={statusOptions} disabled={archived} onChange={setFilter} />
        <SelectField label={copy("Zaman", "Time")} value={listFilters.time} options={timeOptions}
          onChange={(time) => setListFilters((current) => ({ ...current, time }))} />
        {providerOptions.length > 1 || listFilters.hiddenProviders.length ? (
          <MultiSelectField label={copy("Sağlayıcı", "Provider")} options={providerOptions}
            values={shownProviders}
            onChange={(shown) => setListFilters((current) => ({
              ...current,
              hiddenProviders: providers.filter((provider) => !shown.includes(provider)),
            }))} />
        ) : null}
        {/* Each chip narrows the list to only those sessions (Archived hides every active one). */}
        <SectionHeader title={copy("Yalnızca göster", "Show only")} />
        <Row>
          <SessionFilterChip label={managedLabel} selected={listFilters.managed}
            onPress={() => setListFilters((current) => ({ ...current, managed: !current.managed }))} />
          <SessionFilterChip label={copy("Ertelenmiş", "Snoozed")} selected={snoozed} disabled={archived}
            onPress={() => setSnoozed(!snoozed)} />
          <SessionFilterChip label={copy("Arşivlenmiş", "Archived")} selected={archived}
            onPress={() => setArchived(!archived)} />
        </Row>
      </>,
    },
  );
  const waitingForConnection = !visible.length && !activity.error && (activity.privacyUnavailable || activity.readiness === "waiting");
  if (!hydrated || storageError || (!machine && connectionPending))
    return <ScreenList
      data={[]}
      renderItem={() => null}
      title={title}
      ListEmptyComponent={<QueryState query={{
        isPending: !storageError,
        error: storageError,
        refetch: () => useMachines.getState().hydrate(),
      }} loadingLabel={copy("Oturumlar yükleniyor…", "Loading sessions…")} />}
    />;
  if (!machine)
    return (
      <ScreenList
        data={[]}
        renderItem={() => null}
        title={title}
        ListEmptyComponent={
          <NoComputerState
            description={copy(
              "Oturumlarını görmek ve başlatmak için bilgisayarını bağla.",
              "Connect your computer to see and start sessions.",
            )}
          />
        }
      />
    );
  const listQuery = {
    data: directory.length ? directory : undefined,
    isPending: activity.pending,
    error: activity.error,
    isFetching: retry.isPending,
    refetch: retryActivity,
  };
  const listLabel = copy("Oturumlar yükleniyor…", "Loading sessions…");
  const clearFilters = () => {
    // The project pill is the app-wide scope; clearing filters leaves it alone.
    setFilter("all"); setArchived(false); setSnoozed(false); setListFilters(defaultSessionListFilters);
  };
  const filteredOnly = snoozed || (!archived && filter !== "all") || listFilterCount > 0;
  const showEmpty = activity.directoryReady && !rows.length;
  const canCreate = !!projectOptions.length && !activity.privacyPending;
  const olderSessions = windowed && visible.length > 0;
  // Nothing to narrow: an empty directory with no applied filter shows no filter controls.
  const filtersShown = !waitingForConnection && (directory.length > 0 || filterCount > 0 || filter !== "all");
  const emptyState = waitingForConnection ? (
    <ProjectDirectoryFeedback query={listQuery} readiness={activity.readiness} privacyUnavailable={activity.privacyUnavailable} shareConnectionFeedback={shareConnectionFeedback} />
  ) : queryOwnsRegion(listQuery) ? (
    <QueryState query={listQuery} loading="list" loadingLabel={listLabel} shareConnectionFeedback={shareConnectionFeedback} />
  ) : showEmpty ? (
    narrowed || search.trim() ? (
      <NoResults searching={!!search.trim()} filtered={filteredOnly}
        title={copy("Aramana uyan oturum yok.", "No sessions match your search.")}
        filtersTitle={copy("Filtrelere uyan oturum yok.", "No sessions match these filters.")}
        onClearSearch={() => setSearch("")} onClearFilters={clearFilters} />
    ) : archived ? (
      <StateView illustration="inbox-empty" title={copy("Arşivlenmiş oturum yok.", "No archived sessions.")} />
    ) : (
      <StateView
        illustration="no-sessions"
        title={olderSessions
          ? copy("Son 7 günde oturum yok", "No sessions in the last 7 days")
          : projectFilter
            ? copy("Bu projede henüz oturum yok.", "No sessions in this project yet.")
            : copy("Henüz oturum yok.", "No sessions yet.")}
        description={canCreate && !olderSessions && !projectFilter ? copy("Bir proje seçip ilk oturumunu başlat.", "Pick a project and start your first session.") : undefined}
        action={olderSessions ? {
          label: timeLabels.all,
          onPress: () => setListFilters({ ...listFilters, time: "all" }),
        } : canCreate ? { label: copy("Yeni oturum", "New session"), onPress: newSession } : undefined}
      />
    )
  ) : null;
  const list = (
    <HierarchyWidthProvider><SwipeActionsGroup fill><ScreenList<GlobalSessionRow>
      data={rows}
      grouped
      keyExtractor={(row) => row.key}
      title={title}
      scopeControl={<ProjectScopePill projectId={scope.projectId} onChange={scope.setProjectId} />}
      // Page actions keep the shared order: search, filter, then create.
      actions={<>
        {collection.trigger}{filtersShown ? collection.filterTrigger : null}
        {canCreate ? (
          <IconButton label={copy("Yeni oturum", "New session")} onPress={newSession}>
            <Plus size={iconSize.action} color={colors.accent} />
          </IconButton>
        ) : null}
      </>}
      refresh={activity.refetch}
      ListEmptyComponent={emptyState ?? undefined}
      query={{ ...activity.projects, isFetching: activity.refreshing, isPending: activity.pending }}
      header={
        <>
          <Stack.Screen options={{ title }} />
          {collection.sheet}
          <NewSessionSheet visible={creating} onClose={() => setCreating(false)} />
        </>
      }
      renderItem={({ item }) => {
        if (item.kind === "header") return <SessionShelfHeader row={item}
          onToggle={(shelf) => { if (!search.trim()) setCollapsed((current) => ({ ...current, [shelf]: item.expanded })); }} />;
        // The cross-project list is flat; folders belong to a project's own session list.
        if (item.kind === "folder") return null;
        const { project, session } = item;
        return (
          <HierarchyFrame depth={item.depth} reservedWidth={space.sm * 2}>{({ indent, compressed }) => <View style={{ paddingStart: indent }}>
            <SessionListRow machineId={machine.id} projectId={project.id} projectName={project.name}
              projectCwd={project.cwd} projectAppearance={project.appearance} showProject={!projectFilter} session={session}
              ancestors={item.ancestors} compressed={compressed}
              selected={session.id === selectedSessionId}
              canRead={canReadProject}
              snoozed={sessionIsSnoozed(session, now)}
              settled={settledIds.has(session.id)}
              onPress={openSession}
            />
          </View>}</HierarchyFrame>
        );
      }}
    /></SwipeActionsGroup></HierarchyWidthProvider>
  );
  return list;
}
