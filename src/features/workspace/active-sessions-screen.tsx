import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import { useHostQuery } from "@/state/queries";
import { NewSessionSheet } from "./new-session-sheet";
import { useLatestCallback } from "./use-latest-callback";
import { useAsyncAction } from "@/state/actions";
import { AppliedFilters, FilterButton, FilterSheet } from "@/ui/filter-sheet";
import {
  QueryState,
  ScreenList,
  SearchField,
  MultiSelectField,
  SearchToolbar,
  SegmentedControl,
  SelectField,
  StateView,
  ToggleField,
} from "@/ui/primitives";
import { queryOwnsRegion } from "./query-region";
import { ProjectDirectoryFeedback } from "./project-directory-feedback";
import { useCopy } from "@/ui/copy";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useProjectActivity } from "./use-project-activity";
import { SessionListRow } from "./session-list-row";
import { filterProjectSessionDirectory, listedSession, type SessionShelfId } from "./session-collection";
import { useUnseenDoneIds } from "./session-done-store";
import { globalSessionRows, recentGlobalSessionRows, type FolderCollapse, type GlobalSessionRow } from "./global-session-shelves";
import { toggleSessionDirectoryFolder } from "./session-directory";
import { SessionShelfHeader } from "./session-shelf-header";
import { SessionFolderRow } from "./session-folder-row";
import { HierarchyFrame, HierarchyWidthProvider } from "@/ui/hierarchy-frame";
import { View } from "react-native";
import { space } from "@/ui/tokens";
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
type FilterDraft = { status: StatusFilter; archived: boolean; project: string; list: SessionListFilters };

export function ActiveSessionsScreen({
  overview = false,
  initialCreate = false,
}: {
  overview?: boolean;
  /** Opens the new-session sheet once, e.g. from the "New session" quick action. */
  initialCreate?: boolean;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const hydrated = useMachines((state) => state.hydrated);
  const storageError = useMachines((state) => state.storageError);
  const connectionPending = useMachines((state) => state.connectionPending);
  const activity = useProjectActivity();
  const machineId = machine?.id;
  const canReadProject = useLatestCallback((projectId: string) => activity.projects.isProjectVisible(projectId));
  const openSession = useLatestCallback((sessionId: string, projectId: string) => {
    if (machineId && useMachines.getState().activeId === machineId)
      router.navigate({ pathname: "/session/[id]", params: { id: sessionId, projectId, machineId } });
  });
  const retry = useAsyncAction();
  const retryActivity = () => { void retry.run(() => activity.refetch()); };
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [archived, setArchived] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const [listFilters, setListFilters] = useState<SessionListFilters>(defaultSessionListFilters);
  const [draft, setDraft] = useState<FilterDraft | null>(null);
  const [creating, setCreating] = useState(overview && initialCreate);
  const [collapsed, setCollapsed] = useState<Partial<Record<SessionShelfId, boolean>>>({});
  const [folderCollapse, setFolderCollapse] = useState<FolderCollapse>({});
  const projectOptions = (activity.projects.data ?? []).map((project) => ({
    value: project.id,
    label: project.name,
    detail: project.cwd,
  }));
  const lifecycle = useHostQuery<{ records: { sessionId: string; state: string }[] }>(
    ["sessions-lifecycle"],
    "sessions.lifecycle.list",
    {},
    { enabled: overview, interval: 15_000 },
  );
  const settledIds = useMemo(
    () => new Set((lifecycle.data?.records ?? []).filter((r) => r.state === "settled").map((r) => r.sessionId)),
    [lifecycle.data],
  );
  const directory = overview ? activity.directory : activity.sessions;
  const providers = sessionProviders(directory.map(({ session }) => session));
  const now = Date.now();
  const doneIds = useUnseenDoneIds(machineId ?? "");
  const filtered = directory.filter(
    ({ project, session }) =>
      listedSession(session) &&
      (!overview || Boolean(session.archived) === archived) &&
      (!overview || matchesSessionListFilters(session, listFilters, now)) &&
      (!projectFilter || project.id === projectFilter) &&
      (archived ||
        filter === "all" ||
        (filter === "reply" ? session.needsInput : session.status === "running")),
  );
  const visible = filterProjectSessionDirectory(activity.projects.data ?? [], filtered, search);
  // Desktop Last sessions shows the last seven days; archive, search and a Time filter reach older sessions.
  const windowed = overview && !archived && !search.trim() && listFilters.time === "all";
  const rows: GlobalSessionRow[] = overview
    ? recentGlobalSessionRows(visible, windowed ? now : undefined)
    : globalSessionRows(visible, folderCollapse, collapsed, !!search.trim(), false, settledIds, { doneIds, now });
  const listFilterCount = overview ? activeSessionFilterCount(listFilters) : 0;
  const narrowed = !!search.trim() || !!projectFilter || (!archived && filter !== "all") || listFilterCount > 0;
  const title = overview ? copy("Oturumlar", "Sessions") : copy("Aktif oturumlar", "Active sessions");
  const projectLabel = projectOptions.find((project) => project.value === projectFilter)?.label;
  const statusOptions = [
    { value: "all" as const, label: copy("Tümü", "All") },
    { value: "running" as const, label: copy("Çalışıyor", "Working") },
    { value: "reply" as const, label: copy("Girdi gerekiyor", "Needs input") },
  ];
  const statusLabel = statusOptions.find((option) => option.value === filter)?.label;
  const timeLabels: Record<SessionTimeFilter, string> = {
    all: copy("Tüm zamanlar", "All time"),
    today: copy("Bugün", "Today"),
    "7d": copy("Son 7 gün", "Last 7 days"),
    "30d": copy("Son 30 gün", "Last 30 days"),
  };
  const timeOptions = SESSION_TIME_FILTERS.map((value) => ({ value, label: timeLabels[value] }));
  const providerOptions = providers.map((value) => ({ value, label: providerName(value) }));
  const shownProviders = providers.filter((provider) => !listFilters.hiddenProviders.includes(provider));
  const managedLabel = copy("Yönetilen oturumlar", "Managed sessions");
  const filterCount = Number(archived) + Number(!!projectFilter) + Number(!archived && filter !== "all") + listFilterCount;
  const appliedFilters = [
    !archived && filter !== "all" && `${copy("Durum", "Status")}: ${statusLabel}`,
    archived && copy("Arşivlenmiş", "Archived"),
    projectFilter && `${copy("Proje", "Project")}: ${projectLabel ?? projectFilter}`,
    listFilters.hiddenProviders.length > 0 &&
      `${copy("Sağlayıcı", "Provider")}: ${shownProviders.map(providerName).join(", ") || "–"}`,
    listFilters.managed && managedLabel,
    listFilters.time !== "all" && `${copy("Zaman", "Time")}: ${timeLabels[listFilters.time]}`,
  ];
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
          <StateView
            illustration="connect-computer"
            title={copy("Önce bir bilgisayar bağlayın", "Connect a computer first")}
            description={copy(
              "Oturumlarını görmek için bilgisayarını bağla.",
              "Connect your computer to see and start sessions.",
            )}
            action={{
              label: copy("Bilgisayar bağla", "Connect a computer"),
              onPress: () => router.push("/machines"),
            }}
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
  const resetFilters = () => {
    setSearch(""); setFilter("all"); setProjectFilter(""); setArchived(false); setListFilters(defaultSessionListFilters);
  };
  const showEmpty = activity.directoryReady && !rows.length;
  const canCreate = overview && !!projectOptions.length && !activity.privacyPending;
  const emptyState = waitingForConnection ? (
    <ProjectDirectoryFeedback query={listQuery} readiness={activity.readiness} privacyUnavailable={activity.privacyUnavailable} />
  ) : queryOwnsRegion(listQuery) ? (
    <QueryState query={listQuery} loading="list" loadingLabel={listLabel} />
  ) : showEmpty ? (
    narrowed || search.trim() ? (
      <StateView
        illustration="search-empty"
        title={search.trim()
          ? copy("Aramana uyan oturum yok.", "No sessions match your search.")
          : copy("Filtrelere uyan oturum yok.", "No sessions match these filters.")}
        action={{ label: copy("Filtreleri temizle", "Clear filters"), onPress: resetFilters }}
      />
    ) : overview && archived ? (
      <StateView illustration="inbox-empty" title={copy("Arşivlenmiş oturum yok.", "No archived sessions.")} />
    ) : (
      <StateView
        illustration="no-sessions"
        title={!overview
          ? copy("Aktif oturum yok", "No active sessions")
          : visible.length
            ? copy("Son 7 günde oturum yok", "No sessions in the last 7 days")
            : copy("Henüz oturum yok.", "No sessions yet.")}
        description={canCreate ? copy("Bir proje seçip ilk oturumunu başlat.", "Pick a project and start your first session.") : undefined}
        action={canCreate ? { label: copy("Yeni oturum", "New session"), onPress: () => setCreating(true) } : undefined}
      />
    )
  ) : null;
  const list = (
    <HierarchyWidthProvider><ScreenList<GlobalSessionRow>
      data={rows}
      grouped
      keyExtractor={(row) => row.key}
      title={title}
      refresh={activity.refetch}
      ListEmptyComponent={emptyState ?? undefined}
      query={{ ...activity.projects, isFetching: activity.refreshing, isPending: activity.pending }}
      header={
        <>
          <Stack.Screen options={{ title }} />
          {overview ? (
            <>
              <SearchToolbar
                search={<SearchField label={copy("Oturum ara", "Search sessions")} value={search} onChangeText={setSearch} />}
                actions={waitingForConnection ? null : (
                  <FilterButton count={filterCount} onPress={() => setDraft({ status: filter, archived, project: projectFilter, list: listFilters })} />
                )}
              />
              {waitingForConnection ? null : (
                <>
                  <AppliedFilters filters={appliedFilters} />
                </>
              )}
              {draft ? <FilterSheet visible onClose={() => setDraft(null)}
                onReset={() => setDraft({ status: "all", archived: false, project: "", list: defaultSessionListFilters })}
                onApply={() => {
                  setFilter(draft.status); setArchived(draft.archived); setProjectFilter(draft.project);
                  setListFilters(draft.list); setDraft(null);
                }}>
                <SegmentedControl label={copy("Durum", "Status")} value={draft.status} options={statusOptions}
                  disabled={draft.archived} onChange={(status) => setDraft({ ...draft, status })} />
                <ToggleField label={copy("Arşivlenmiş oturumlar", "Archived sessions")} value={draft.archived}
                  onChange={(value) => setDraft({ ...draft, archived: value })} />
                <SelectField label={copy("Proje", "Project")} searchable value={draft.project}
                  options={[{ value: "", label: copy("Tüm projeler", "All projects") }, ...projectOptions]}
                  disabled={activity.privacyPending} onChange={(project) => setDraft({ ...draft, project })} />
                <ToggleField label={managedLabel} value={draft.list.managed}
                  onChange={(managed) => setDraft({ ...draft, list: { ...draft.list, managed } })} />
                <SelectField label={copy("Zaman", "Time")} value={draft.list.time} options={timeOptions}
                  onChange={(time) => setDraft({ ...draft, list: { ...draft.list, time } })} />
                {providerOptions.length > 1 || draft.list.hiddenProviders.length ? (
                  <MultiSelectField label={copy("Sağlayıcı", "Provider")} options={providerOptions}
                    values={providers.filter((provider) => !draft.list.hiddenProviders.includes(provider))}
                    onChange={(shown) => setDraft({ ...draft, list: {
                      ...draft.list,
                      hiddenProviders: providers.filter((provider) => !shown.includes(provider)),
                    } })} />
                ) : null}
              </FilterSheet> : null}
            </>
          ) : (
            <SearchField label={copy("Oturum ara", "Search sessions")} value={search} onChangeText={setSearch} />
          )}
          <NewSessionSheet visible={creating} onClose={() => setCreating(false)} />
        </>
      }
      renderItem={({ item }) => {
        if (item.kind === "header") return <SessionShelfHeader row={item}
          onToggle={(shelf) => { if (!search.trim()) setCollapsed((current) => ({ ...current, [shelf]: item.expanded })); }} />;
        if (item.kind === "folder") return <SessionFolderRow row={item} projectName={item.project.name}
          onToggle={() => setFolderCollapse((current) => ({
            ...current,
            [item.project.id]: toggleSessionDirectoryFolder(current[item.project.id] ?? {}, item, !!search.trim()),
          }))} />;
        const { project, session } = item;
        return (
          <HierarchyFrame depth={item.depth} reservedWidth={space.sm * 2}>{({ indent, compressed }) => <View style={{ paddingStart: indent }}>
            <SessionListRow machineId={machine.id} projectId={project.id} projectName={project.name}
              projectCwd={project.cwd} projectAppearance={project.appearance} showProject session={session}
              ancestors={item.ancestors} compressed={compressed}
              canRead={canReadProject}
              settled={settledIds.has(session.id)}
              onPress={openSession}
            />
          </View>}</HierarchyFrame>
        );
      }}
    /></HierarchyWidthProvider>
  );
  return list;
}
