import { scrollKeyboardDismissMode } from "@/ui/scroll-keyboard";
import { useMobileTheme } from "@/ui/theme";
import { ProjectDirectorySlot } from "./project-directory-feedback";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useLatestCallback } from "./use-latest-callback";
import { FlatList, View, type ListRenderItem } from "react-native";
import { router, Stack, type Href } from "expo-router";
import FolderPlus from "lucide-react-native/icons/folder-plus";
import ArrowDownUp from "lucide-react-native/icons/arrow-down-up";
import SquarePen from "lucide-react-native/icons/square-pen";
import FolderTree from "lucide-react-native/icons/folder-tree";
import GitBranch from "lucide-react-native/icons/git-branch";
import GitPullRequest from "lucide-react-native/icons/git-pull-request";
import Pencil from "lucide-react-native/icons/pencil";
import FolderInput from "lucide-react-native/icons/folder-input";
import Copy from "lucide-react-native/icons/copy";
import Info from "lucide-react-native/icons/info";
import * as Clipboard from "expo-clipboard";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import { useSingleFlight } from "@/state/actions";
import {
  Button,
  IconButton,
  ScreenHeading,
  MutationState,
  NavigationGroup,
  NavigationRow,
  Notice,
  Screen,
  SearchField,
  useCollapsibleSearch,
  Row,
  SectionHeader,
  Sheet,
  SegmentedControl,
  ToggleField,
} from "@/ui/primitives";
import { RowOptionsSheet, type MenuAction } from "@/ui/overflow-menu";
import { showToast } from "@/ui/toast";
import { errorMessage } from "@/ui/error-message";
import { useScreenContentInsets } from "@/ui/screen-content-insets";
import { iconSize, metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { haptic } from "@/ui/motion";
import { SwipeActionsGroup } from "@/ui/swipe-actions";
import type { HostProject } from "@/domain/types";
import type { MobileMachine } from "@/remote/types";
import {
  directorySections,
  directoryRows,
  latestProjectSessions,
  projectAttentionCounts,
  projectNameContexts,
  projectSortOf,
  PINNED_SECTION_KEY,
  PROJECT_SORTS,
  sortDirectoryProjects,
  type DirectoryProject,
  type DirectoryRow,
  type ProjectSort,
} from "./project-directory";
import { useProjectDirectory } from "./use-project-directory";
import { GroupLockSection, HiddenGroupsFlow, HiddenGroupsRow, useHiddenGroupsEntry } from "../group-lock/group-lock-section";
import { ProjectFolderBrowser } from "./project-folder-browser";
import { WelcomeScreen } from "../connections/welcome-screen";
import { useProjectActivity } from "./use-project-activity";
import { runningProjectCounts } from "./activity-model";
import { appPreferences, useAppPreferences } from "../navigation-prefs/app-preferences";
import { groupProjectsByRepository } from "./repository-grouping";
import { ProjectGroupHeader, ProjectRow, type ProjectRowView } from "./project-row";
import { ProjectDetailsSheet } from "./project-details-sheet";
import { ProjectOrganization } from "./project-organization";
import { latestProjectActivity } from "./project-summaries";
import { openNewChat } from "./new-chat-navigation";
import {
  projectDirectoryPreferences,
  useProjectDirectoryPreferences,
  type ProjectDirectoryPreferences,
} from "@/state/project-directory-preferences";
import {
  ModelRoutingGetResultSchema,
  type ModelRoutingState,
} from "../../../../src/shared/model/host-contracts/model-routing";
import { modelRoutingProjectKey } from "../../../../src/shared/model/modelRoutingPools";
import { pushOnce } from "@/ui/navigation";

export function ProjectsScreen() {
  const machine = useActiveMachine();
  const connection = useConnectionScope();
  if (!machine) return <WelcomeScreen />;
  return <ProjectsConnectionScreen key={connection.token} machine={machine} connection={connection} />;
}

function ProjectsConnectionScreen({ machine, connection }: {
  machine: MobileMachine;
  connection: ConnectionScope;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  // Horizontal gutters only; this component renders the Screen frame that owns the bottom inset.
  const gutter = useScreenContentInsets();
  const selectProject = useMachines((state) => state.selectProject);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [adding, setAdding] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [hiddenGroupsOpen, setHiddenGroupsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const {
    preferences,
    hydrated,
    error: preferencesError,
  } = useProjectDirectoryPreferences(machine?.id);
  const [openingId, setOpeningId] = useState<string>();
  const [detailsId, setDetailsId] = useState<string>();
  const [optionsId, setOptionsId] = useState<string>();
  const [organizing, setOrganizing] = useState<{ projectId: string; sessionId: string; kind: "projectName" | "projectGroup" }>();
  const {
    query,
    projects: directoryProjects,
    groups: directoryGroups,
    directory,
    directoryReady,
    privacyUnavailable,
    readiness,
    isProjectVisible,
  } = useProjectDirectory();
  // Hidden groups open from "Sort and view", never as a row in the project list.
  const hiddenGroups = useHiddenGroupsEntry(directory);
  const { preferences: appPrefs, hydrated: appPrefsHydrated } = useAppPreferences();
  const byRepository = appPrefs.groupByRepository;
  const { projects, groups } = useMemo(
    () =>
      byRepository
        ? groupProjectsByRepository(directoryProjects)
        : { projects: directoryProjects, groups: directoryGroups },
    [byRepository, directoryProjects, directoryGroups],
  );
  const activity = useProjectActivity();
  const running = useMemo(() => runningProjectCounts(activity.directory), [activity.directory]);
  const activeAt = useMemo(() => latestProjectActivity(activity.directory), [activity.directory]);
  const needsYou = useMemo(() => projectAttentionCounts(activity.directory), [activity.directory]);
  const contextSessions = useMemo(() => latestProjectSessions(activity.directory), [activity.directory]);
  const sort = projectSortOf(preferences.sort);
  const sortLabels: Record<ProjectSort, string> = {
    desktop: copy("Bilgisayardaki sıra", "Computer order"),
    recent: copy("Son etkinlik", "Recent activity"),
    name: copy("Ad (A–Z)", "Name (A–Z)"),
  };
  const contexts = useMemo(() => projectNameContexts(projects), [projects]);
  // Personal/Work tags reach the Host through desktop model routing; read-only here.
  const routing = useHostQuery<ModelRoutingState>(["modelRouting"], "modelRouting.get", {}, {
    enabled: machine?.capabilities?.includes("models.routing.v1") === true,
    queryFn: async (client, signal) =>
      ModelRoutingGetResultSchema.parse(await client.request("modelRouting.get", {}, { signal })).state,
  });
  const projectKinds = routing.data?.projectKinds;
  const open = useHostMutation<HostProject>("projects.open", ["projects"]);
  const openFlight = useSingleFlight<void>();
  const showGroups =
    (preferences.view === "grouped" || byRepository) &&
    (groups.length > 0 || projects.some((project) => project.pinned));
  // One sort applies to every view: inside each group, in the pinned section and in the flat list.
  const buildSections = useCallback(
    (query: string, collapsed: Readonly<Record<string, boolean>>) => {
      const ordered = sortDirectoryProjects(projects, preferences, activeAt);
      const sections = directorySections(ordered, groups, query, collapsed, running);
      if (showGroups) return sections;
      const matchingIds = new Set(
        sections.flatMap((section) => section.data.map((project) => project.id)),
      );
      const data = ordered.filter((project) => matchingIds.has(project.id));
      return [
        { key: "", count: data.length, total: data.length, running: 0, expanded: true, data },
      ];
    },
    [projects, groups, preferences, showGroups, running, activeAt],
  );
  const sections = useMemo(
    () =>
      buildSections(
        deferredSearch,
        showGroups
          ? preferences.collapsed
          : Object.fromEntries(groups.map((group) => [group.id, false])),
      ),
    [buildSections, deferredSearch, showGroups, preferences.collapsed, groups],
  );
  const rows = useMemo(() => directoryRows(sections, showGroups), [sections, showGroups]);
  const updatePreferences = useCallback(
    (patch: Partial<ProjectDirectoryPreferences>) => {
      if (connection.isCurrent()) void projectDirectoryPreferences.getState().update(machine.id, patch);
    },
    [connection, machine.id],
  );
  const matching = sections.reduce((count, section) => count + section.count, 0);
  const go = (project: HostProject, view?: ProjectRowView) => {
    if (!connection.isCurrent()) return;
    selectProject(project.id);
    router.navigate({
      pathname: "/project/[id]",
      params: { id: project.id, machineId: machine.id, ...(view ? { view } : {}) },
    });
  };
  const openFolder = (cwd: string, row?: { id: string; view?: ProjectRowView }) => {
    if (!connection.isCurrent() || openFlight.isPending()) return;
    if (row) setOpeningId(row.id);
    void openFlight.run(async () => {
      try {
        if (!connection.isCurrent()) return;
        const opened = await open.mutateAsync({ cwd });
        if (!connection.isCurrent()) return;
        haptic.success();
        if (!row) setAdding(false);
        go(opened, row?.view);
      } catch (cause) {
        // The folder browser shows its own failure; a row reports beside the tap with Retry, since a
        // notice at the top of a scrolled list would stay out of sight.
        if (row && connection.isCurrent()) {
          open.reset();
          showToast({ tone: "danger", message: errorMessage(cause, copy),
            action: { label: copy("Yeniden dene", "Retry"), onPress: () => openFolder(cwd, row) } });
        }
      } finally {
        if (row && connection.isCurrent()) setOpeningId(undefined);
      }
    });
  };
  const choose = useLatestCallback((project: DirectoryProject, view?: ProjectRowView) => {
    if (!connection.isCurrent() || openFlight.isPending() || !directoryReady) return;
    if (project.registered) {
      if (!isProjectVisible(project.id)) return;
      go(project, view);
      return;
    }
    openFolder(project.cwd, { id: project.id, view });
  });
  const showOptions = useLatestCallback((id: string) => {
    if (connection.isCurrent() && directoryReady) setOptionsId(id);
  });
  const startSession = useLatestCallback((id: string) => {
    const project = projects.find((item) => item.id === id);
    if (!project?.registered || !connection.isCurrent() || !isProjectVisible(project.id)) return;
    selectProject(project.id);
    openNewChat({ projectId: project.id, machineId: machine.id });
  });
  const details = detailsId ? projects.find((item) => item.id === detailsId) : undefined;
  const optionsProject = optionsId ? projects.find((item) => item.id === optionsId) : undefined;
  const organizationSupported = machine.capabilities?.includes("projects.organization.desktop.v1") === true;
  const projectOptions = (project: DirectoryProject): MenuAction[] => {
    const contextSession = contextSessions[project.id];
    const organize = (kind: "projectName" | "projectGroup") => () => {
      if (contextSession && connection.isCurrent()) setOrganizing({ projectId: project.id, sessionId: contextSession, kind });
    };
    return [
      ...(project.registered ? [
        { key: "new-session", group: "open", label: copy("Yeni oturum", "New session"), icon: <SquarePen />, onPress: () => startSession(project.id) },
        { key: "files", group: "open", label: copy("Dosyalar", "Files"), icon: <FolderTree />, opens: true, onPress: () => choose(project, "files") },
        { key: "git", group: "open", label: copy("Değişiklikler", "Changes"), icon: <GitBranch />, opens: true, onPress: () => choose(project, "git") },
        {
          key: "pull-requests", group: "open", label: copy("Pull request’ler", "Pull requests"), icon: <GitPullRequest />, opens: true,
          onPress: () => {
            if (!connection.isCurrent() || !isProjectVisible(project.id)) return;
            pushOnce(`/pull-requests?projectId=${encodeURIComponent(project.id)}&machineId=${encodeURIComponent(machine.id)}` as Href);
          },
        },
      ] satisfies MenuAction[] : [
        { key: "open", group: "open", label: copy("Projeyi aç", "Open project"), icon: <FolderTree />, onPress: () => choose(project) },
      ]),
      // The Host organizes a project through one of its sessions; without one the rows stay out of the way.
      ...(project.registered && organizationSupported && contextSession ? [
        { key: "rename", group: "organize", label: copy("Yeniden adlandır", "Rename"), icon: <Pencil />, opens: true,
          onPress: organize("projectName") },
        { key: "group", group: "organize", label: copy("Gruba taşı", "Move to group"), icon: <FolderInput />, opens: true,
          onPress: organize("projectGroup") },
      ] : []),
      {
        key: "copy-path", group: "info", label: copy("Yolu kopyala", "Copy path"), icon: <Copy />,
        onPress: () => {
          void Clipboard.setStringAsync(project.cwd).then(
            (accepted) => showToast(accepted === false
              ? { tone: "danger", message: copy("Kopyalanamadı. Yeniden dene.", "Could not copy. Try again.") }
              : { tone: "success", message: copy("Yol kopyalandı", "Path copied") }),
            () => showToast({ tone: "danger", message: copy("Kopyalanamadı. Yeniden dene.", "Could not copy. Try again.") }),
          );
        },
      },
      { key: "details", group: "info", label: copy("Ayrıntılar", "Details"), icon: <Info />, opens: true,
        onPress: () => { if (connection.isCurrent()) setDetailsId(project.id); } },
    ];
  };
  const chooseById = useLatestCallback((id: string) => {
    const project = projects.find((item) => item.id === id);
    if (project) choose(project);
  });
  const addInEmptyState = directoryReady && query.isSuccess && !query.error &&
    !privacyUnavailable && readiness !== "waiting" && !projects.length && !search.trim();
  const feedbackProps = {
    query,
    readiness,
    privacyUnavailable,
    loadingLabel: copy("Projeler yükleniyor…", "Loading projects…"),
    empty: directoryReady && !matching,
    noResults: { searching: !!search.trim(), title: copy("Aramana uyan proje yok.", "No projects match your search."), onClearSearch: () => setSearch("") },
    emptyTitle: search.trim()
      ? copy("Aramana uyan proje yok.", "No projects match your search.")
      : copy("Bu bilgisayarda henüz proje yok.", "No projects on this computer yet."),
    emptyIllustration: search.trim() ? ("search-empty" as const) : ("no-projects" as const),
    emptyAction: search.trim()
      ? { label: copy("Aramayı temizle", "Clear search"), onPress: () => setSearch("") }
      : {
          label: copy("Proje ekle", "Add project"),
          onPress: () => {
            open.reset();
            setAdding(true);
          },
        },
  };
  const projectSearch = useCollapsibleSearch(
    <SearchField
      label={copy("Projelerinde ara", "Search projects")}
      value={search}
      onChangeText={setSearch}
      placeholder={copy("Proje veya grup ara", "Search project or group")}
    />,
  );
  const header = useMemo(
    () => (
      <View style={{ gap: space.xs, paddingBottom: space.sm }}>
        <ScreenHeading
          title={copy("Projeler", "Projects")}
          // Search, sort and view, and add share the title row; no toolbar row sits above the list.
          actions={<>
            {projectSearch.trigger}
            <IconButton
              label={`${copy("Sıralama ve görünüm", "Sort and view")}: ${sortLabels[sort]}`}
              expanded={optionsOpen}
              onPress={() => setOptionsOpen(true)}
            >
              <ArrowDownUp size={iconSize.action} color={sort === "desktop" ? colors.muted : colors.accent} />
            </IconButton>
            {addInEmptyState ? null : (
              <IconButton
                label={copy("Proje ekle", "Add project")}
                disabled={open.isPending || !directoryReady}
                onPress={() => {
                  open.reset();
                  setAdding(true);
                }}
              >
                <FolderPlus size={iconSize.action} strokeWidth={2} color={colors.accent} />
              </IconButton>
            )}
          </>}
        />
        {projectSearch.sheet}
        {preferencesError ? (
          <Notice
            tone="warning"
            message={copy(
              "Liste tercihi kaydedilemedi. Yeniden seçerek dene.",
              "The list preference could not be saved. Select it again to retry.",
            )}
          />
        ) : null}
        {!adding ? <MutationState mutation={open} /> : null}
        {/* Auxiliary rows step aside while a search narrows the list. */}
        {!search.trim() ? <GroupLockSection directory={directory} /> : null}
      </View>
    ),
    [
      copy,
      colors,
      search,
      adding,
      optionsOpen,
      addInEmptyState,
      open.status,
      open.isPending,
      open.reset,
      open.error,
      directoryReady,
      preferencesError,
      matching,
      directory,
      sort,
      projectSearch.trigger,
      projectSearch.sheet,
    ],
  );
  const keyExtractor = useCallback((row: DirectoryRow) => row.key, []);
  const renderItem = useCallback<ListRenderItem<DirectoryRow>>(
    ({ item, index }) => {
      if (item.kind === "group") {
        const section = item.section;
        return (
          <ProjectGroupHeader
            name={
              section.pinned
                ? copy("Sabitlenenler", "Pinned")
                : (section.group?.name ?? copy("Diğerleri", "Others"))
            }
            appearance={section.group?.appearance}
            first={index === 0}
            count={section.count}
            running={section.running}
            expanded={section.expanded}
            collapsible={!search.trim()}
            onToggle={() =>
              updatePreferences({
                collapsed: { ...preferences.collapsed, [section.key]: section.expanded },
              })
            }
          />
        );
      }
      const project = item.project;
      return (
        <ProjectRow
          id={project.id}
          name={project.name}
          context={contexts[project.id]}
          path={preferences.fullPaths ? project.cwd : undefined}
          kind={projectKinds?.[modelRoutingProjectKey(project.cwd)]}
          appearance={project.appearance}
          depth={item.depth}
          grouped={showGroups}
          registered={project.registered}
          running={running[project.id] ?? 0}
          needsYou={needsYou[project.id] ?? 0}
          activeAt={activeAt[project.id]}
          opening={openingId === project.id}
          disabled={open.isPending || !directoryReady}
          onPress={chooseById}
          onOptions={showOptions}
          onNewSession={startSession}
        />
      );
    },
    [
      search,
      preferences,
      running,
      needsYou,
      activeAt,
      contexts,
      projectKinds,
      openingId,
      open.isPending,
      directoryReady,
      showGroups,
      copy,
      updatePreferences,
      chooseById,
      showOptions,
      startSession,
    ],
  );
  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: copy("Projeler", "Projects") }} />
      <SwipeActionsGroup fill>
      <FlatList<DirectoryRow>
        data={matching ? rows : []}
        keyExtractor={keyExtractor}
        style={{ flex: 1, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}
        contentContainerStyle={{
          paddingLeft: gutter.left,
          paddingRight: gutter.right,
          paddingTop: space.xs,
          // The Screen frame below already clears the dock and home indicator.
          paddingBottom: space.lg,
          flexGrow: 1,
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={<ProjectDirectorySlot {...feedbackProps} />}
        renderItem={renderItem}
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews={false}
        refreshing={refreshing}
        onRefresh={() => {
          if (refreshing) return;
          setRefreshing(true);
          return activity.refetch().finally(() => setRefreshing(false));
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={scrollKeyboardDismissMode("on-drag")}
        automaticallyAdjustKeyboardInsets={false}
        contentInsetAdjustmentBehavior="never"
      />
      </SwipeActionsGroup>
      <Sheet
        visible={optionsOpen}
        title={copy("Sıralama ve görünüm", "Sort and view")}
        size="compact"
        onClose={() => setOptionsOpen(false)}
      >
        <NavigationGroup>
          <SectionHeader title={copy("Sıralama", "Sort by")} />
          {PROJECT_SORTS.map((value) => (
            <NavigationRow
              key={value}
              intent="select"
              label={sortLabels[value]}
              selected={sort === value}
              disabled={!hydrated}
              onPress={() => updatePreferences({ sort: value })}
            />
          ))}
        </NavigationGroup>
        <SectionHeader title={copy("Görünüm", "View")} />
        {/* One choice: repository grouping replaces the list and the desktop groups, so it is a peer view. */}
        <SegmentedControl
          label={copy("Görünüm", "View")}
          hideLabel
          value={byRepository ? "repository" : preferences.view}
          disabled={!hydrated || !appPrefsHydrated}
          options={[
            { value: "list", label: copy("Liste", "List") },
            { value: "grouped", label: copy("Gruplar", "Groups") },
            { value: "repository", label: copy("Depoya göre", "By repository") },
          ]}
          onChange={(view) => {
            if (view === "repository") {
              if (!byRepository) void appPreferences.getState().update({ groupByRepository: true });
              return;
            }
            if (byRepository) void appPreferences.getState().update({ groupByRepository: false });
            if (view !== preferences.view) updatePreferences({ view });
          }}
        />
        <ToggleField
          label={copy("Tam klasör yolları", "Full folder paths")}
          value={preferences.fullPaths}
          disabled={!hydrated}
          onChange={(fullPaths) => updatePreferences({ fullPaths })}
        />
        {hiddenGroups.supported ? (
          <NavigationGroup>
            <HiddenGroupsRow count={hiddenGroups.count} onOpen={() => setHiddenGroupsOpen(true)} />
          </NavigationGroup>
        ) : null}
        {showGroups ? (
          <Row>
            <Button
              label={copy("Tümünü aç", "Expand all")}
              tone="quiet"
              flush
              onPress={() =>
                updatePreferences({
                  collapsed: Object.fromEntries([
                    ...groups.map((group) => [group.id, false]),
                    [PINNED_SECTION_KEY, false],
                    ["", false],
                  ]),
                })
              }
            />
            <Button
              label={copy("Tümünü daralt", "Collapse all")}
              tone="quiet"
              onPress={() =>
                updatePreferences({
                  collapsed: Object.fromEntries([
                    ...groups.map((group) => [group.id, true]),
                    [PINNED_SECTION_KEY, true],
                    ["", true],
                  ]),
                })
              }
            />
          </Row>
        ) : null}
      </Sheet>
      <HiddenGroupsFlow directory={directory} open={hiddenGroupsOpen} onClose={() => setHiddenGroupsOpen(false)} />
      <RowOptionsSheet
        visible={!!optionsProject}
        title={copy("Proje seçenekleri", "Project options")}
        subtitle={optionsProject?.name}
        actions={optionsProject ? projectOptions(optionsProject) : []}
        onClose={() => setOptionsId(undefined)}
      />
      {organizing ? (
        <ProjectOrganization
          key={`${organizing.projectId}:${organizing.kind}`}
          scope={{ machineId: machine.id, sessionId: organizing.sessionId }}
          projectId={organizing.projectId}
          initialEditor={{ kind: organizing.kind }}
          onClose={() => setOrganizing(undefined)}
        />
      ) : null}
      {details ? (
        <ProjectDetailsSheet
          visible
          project={details}
          machineName={machine.name}
          groupName={groups.find((group) => group.id === details.groupId)?.name}
          registered={details.registered}
          onClose={() => setDetailsId(undefined)}
          onOpen={() => {
            setDetailsId(undefined);
            choose(details);
          }}
        />
      ) : null}
      {adding ? (
        <ProjectFolderBrowser
          key={machine.id}
          onClose={() => setAdding(false)}
          mutation={open}
          onOpen={openFolder}
        />
      ) : null}
    </Screen>
  );
}
