import { HierarchyFrame } from "@/ui/hierarchy-frame";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { useAsyncAction } from "@/state/actions";
import { View } from "react-native";
import Plus from "lucide-react-native/icons/plus";
import ListFilter from "lucide-react-native/icons/list-filter";
import { AppliedFilters, FilterSheet } from "@/ui/filter-sheet";
import {
  Empty,
  FormActions,
  IconButton,
  Notice,
  QueryState,
  ScreenList,
  SearchField,
  SearchToolbar,
  SegmentedControl,
  ToggleField,
  SelectField,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { colors, metrics, space } from "@/ui/tokens";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useProjectActivity } from "./use-project-activity";
import { useMobileTheme } from "@/ui/theme";
import { SessionListRow } from "./session-list-row";
import {
  GroupedListRow,
  rowInset,
} from "./shared";
import { toggleSessionDirectoryFolder } from "./session-directory";
import { SessionFolderRow } from "./session-folder-row";
import { filterProjectSessionDirectory, projectSessionCollectionRows, sessionCollectionScope, type ProjectSessionCollectionRow } from "./session-collection";
import { SessionProjectRow } from "./session-project-row";

type StatusFilter = "all" | "running" | "reply";

export function ActiveSessionsScreen({ overview = false }: { overview?: boolean }) {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const hydrated = useMachines((state) => state.hydrated);
  const storageError = useMachines((state) => state.storageError);
  const connectionPending = useMachines((state) => state.connectionPending);
  const activity = useProjectActivity();
  const retry = useAsyncAction();
  const retryActivity = () => { void retry.run(() => activity.refetch()); };
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [archived, setArchived] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const [filterDraft, setFilterDraft] = useState<{ filter: StatusFilter; archived: boolean; projectId: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newProjectId, setNewProjectId] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, Record<string, boolean>>>({});
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const selectedProjectId = useMachines((state) => state.selectedProjectId);
  const projectOptions = (activity.projects.data ?? []).map((project) => ({
    value: project.id,
    label: project.name,
    detail: project.cwd,
  }));
  const creationProject = [newProjectId, projectFilter, selectedProjectId, projectOptions[0]?.value]
    .find((id) => projectOptions.some((project) => project.value === id));
  const directory = overview ? activity.directory : activity.sessions;
  const filtered = directory.filter(
    ({ project, session }) =>
      (!overview || Boolean(session.archived) === archived) &&
      (!projectFilter || project.id === projectFilter) &&
      (archived ||
        filter === "all" ||
        (filter === "reply" ? session.needsInput : session.status === "running")),
  );
  const visible = filterProjectSessionDirectory(activity.projects.data ?? [], filtered, search);
  const rows: ProjectSessionCollectionRow[] = overview
    ? projectSessionCollectionRows(activity.projects.data ?? [], visible, machine?.id ?? "", collapsed, collapsedProjects, !!search.trim())
    : visible.map(({ project, session }) => ({ kind: "session", key: `${project.id}:${session.id}`, project, session, depth: 0 }));
  const narrowed = !!search.trim() || !!projectFilter || (!archived && filter !== "all");
  const title = overview ? copy("Oturumlar", "Sessions") : copy("Aktif oturumlar", "Active sessions");
  const newSessionButton = overview ? (
    <IconButton
      label={copy("Yeni oturum", "New session")}
      tone="default"
      disabled={!projectOptions.length || activity.privacyPending}
      onPress={() => setCreating(true)}
    >
      <Plus size={20} strokeWidth={2} color={colors.accent} />
    </IconButton>
  ) : null;
  const filterCount = Number(!archived && filter !== "all") + Number(archived) + Number(!!projectFilter);
  const filters = overview ? <IconButton label={copy("Filtreler", "Filters")}
    tone={filterCount > 0 ? "primary" : "default"}
    expanded={filterDraft !== null}
    onPress={() => setFilterDraft({ filter, archived, projectId: projectFilter })}>
    <ListFilter size={20} color={filterCount ? colors.primaryText : colors.muted} />
  </IconButton> : null;
  if (!hydrated || storageError || (!machine && connectionPending))
    return <ScreenList
      data={[]}
      renderItem={() => null}
      title={title}
      header={<QueryState query={{
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
        header={
          <Empty
            title={copy("Önce bir bilgisayar bağlayın", "Connect a computer first")}
            action={{
              label: copy("Bilgisayar bağla", "Connect a computer"),
              onPress: () => router.push("/machines"),
            }}
          />
        }
      />
    );
  return (
    <ScreenList
      data={rows}
      grouped
      keyExtractor={(row) => row.key}
      title={title}
      actions={newSessionButton}
      refresh={activity.refetch}
      query={{ ...activity.projects, isFetching: activity.refreshing, isPending: activity.pending }}
      header={
        <>
          <Stack.Screen options={{ title }} />
          <SearchToolbar search={<SearchField
            label={copy("Oturum ara", "Search sessions")}
            value={search}
            onChangeText={setSearch}
          />} actions={filters} />
          <AppliedFilters filters={[
            projectFilter && `${copy("Proje", "Project")}: ${projectOptions.find(project => project.value === projectFilter)?.label ?? projectFilter}`,
            overview && archived && copy("Arşiv", "Archive"),
            !archived && filter !== "all" && (filter === "running" ? copy("Çalışıyor", "Running") : copy("Yanıt bekleyenler", "Awaiting reply")),
          ]} />
          {filterDraft ? <FilterSheet visible onClose={() => setFilterDraft(null)}
            onReset={() => setFilterDraft({ filter: "all", archived: false, projectId: "" })}
            onApply={() => {
              setFilter(filterDraft.filter); setArchived(filterDraft.archived); setProjectFilter(filterDraft.projectId); setFilterDraft(null);
            }}>
            <SelectField label={copy("Proje", "Project")} searchable value={filterDraft.projectId}
              options={[{ value: "", label: copy("Tüm projeler", "All projects") }, ...projectOptions]}
              disabled={activity.privacyPending} onChange={(projectId) => setFilterDraft({ ...filterDraft, projectId })} />
            <SegmentedControl label={copy("Oturum filtreleri", "Session filters")} value={filterDraft.filter}
              disabled={filterDraft.archived} onChange={(filter) => setFilterDraft({ ...filterDraft, filter })}
              options={[
                { value: "all", label: copy("Tümü", "All") },
                { value: "running", label: copy("Çalışıyor", "Running") },
                { value: "reply", label: copy("Yanıt bekleyenler", "Awaiting reply") },
              ]} />
            <ToggleField label={copy("Arşiv", "Archive")} value={filterDraft.archived}
              onChange={(archived) => setFilterDraft({ ...filterDraft, archived })} />
          </FilterSheet> : null}
          <QueryState
            query={{
              data: directory.length ? directory : undefined,
              isPending: activity.pending,
              error: activity.error,
              isFetching: retry.isPending,
              refetch: retryActivity,
            }}
            loading="list"
            loadingLabel={copy("Oturumlar yükleniyor…", "Loading sessions…")}
          />
          {!activity.error && activity.privacyUnavailable ? (
            <Notice
              tone="info"
              message={copy(
                "Oturumları görmek için bilgisayarda bycoda’yı aç ve proje listesini eşitle.",
                "Open bycoda on the computer and sync the project directory to see sessions.",
              )}
              retrying={retry.isPending}
              onRetry={retryActivity}
            />
          ) : !activity.error && activity.readiness === "waiting" ? (
            <Notice message={copy("Bağlantı bekleniyor.", "Waiting for a connection.")}
              action={{ label: copy("Bağlantıları yönet", "Manage connections"), onPress: () => router.push("/machines") }} />
          ) : !activity.complete && !activity.pending && !activity.error ? (
            <Notice
              tone="warning"
              message={copy(
                "Bazı projelerin oturumları henüz alınamadı.",
                "Sessions from some projects are not available yet.",
              )}
              retrying={retry.isPending}
              onRetry={retryActivity}
            />
          ) : null}
          {activity.directoryReady && activity.complete && !visible.length ? (
            <Empty
              title={
                search.trim()
                  ? copy("Aramana uyan oturum yok.", "No sessions match your search.")
                  : narrowed
                    ? copy("Filtrelere uyan oturum yok.", "No sessions match these filters.")
                  : overview
                    ? archived
                      ? copy("Arşivlenmiş oturum yok.", "No archived sessions.")
                      : copy("Henüz oturum yok.", "No sessions yet.")
                    : copy("Aktif oturum yok", "No active sessions")
              }
              action={narrowed ? {
                label: copy("Sıfırla", "Reset"),
                onPress: () => { setSearch(""); setFilter("all"); setProjectFilter(""); },
              } : undefined}
            />
          ) : null}
          <Sheet
            visible={creating}
            title={copy("Yeni oturum", "New session")}
            size="form"
            onClose={() => setCreating(false)}
          >
            <SelectField
              label={copy("Proje", "Project")}
              value={creationProject ?? undefined}
              options={projectOptions}
              searchable
              onChange={setNewProjectId}
            />
            <FormActions
              submitLabel={copy("Yeni oturum", "New session")}
              tone="primary"
              disabled={!creationProject || activity.privacyPending}
              onSubmit={() => {
                if (!creationProject || useMachines.getState().activeId !== machine.id) return;
                useMachines.getState().selectProject(creationProject);
                setCreating(false);
                router.push({
                  pathname: "/project/[id]",
                  params: { id: creationProject, machineId: machine.id, create: "session" },
                });
              }}
            />
          </Sheet>
        </>
      }
      renderItem={({ item, index }) => {
        const project = item.project;
        const scope = sessionCollectionScope(machine.id, project.id);
        if (item.kind === "project") return <SessionProjectRow row={item}
          onToggle={() => {
            if (!search.trim()) setCollapsedProjects((current) => ({ ...current, [scope]: item.expanded }));
          }} />;
        if (item.kind === "folder") {
          return <SessionFolderRow row={item}
            onToggle={() => setCollapsed((current) => ({ ...current,
              [scope]: toggleSessionDirectoryFolder(current[scope] ?? {}, item, !!search.trim()) }))} />;
        }
        const session = item.session;
        return (
          <GroupedListRow
            first={index === 0 || rows[index - 1]?.kind !== "session" || rows[index - 1]?.project.id !== project.id}
            last={index === rows.length - 1 || rows[index + 1]?.kind !== "session" || rows[index + 1]?.project.id !== project.id}
            inset={rowInset}
          >
            <HierarchyFrame depth={item.depth} reservedWidth={metrics.touchTarget + space.sm * 2}>{({indent,compressed}) => <View style={{ paddingStart: indent }}>
            <SessionListRow machineId={machine.id} projectId={project.id} projectName={project.name}
              projectCwd={project.cwd} session={session} ancestors={item.ancestors} compressed={compressed}
              canRead={() => activity.projects.isProjectVisible(project.id)}
              onPress={() => {
                if (useMachines.getState().activeId === machine.id)
                  router.push({
                    pathname: "/session/[id]",
                    params: { id: session.id, projectId: project.id, machineId: machine.id },
                  });
              }}
            />
            </View>}</HierarchyFrame>
          </GroupedListRow>
        );
      }}
    />
  );
}
