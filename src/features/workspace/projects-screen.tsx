import { scrollKeyboardDismissMode } from "@/ui/scroll-keyboard";
import { useMobileTheme } from "@/ui/theme";
import { ProjectDirectorySlot } from "./project-directory-feedback";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useLatestCallback } from "./use-latest-callback";
import { FlatList, View, type ListRenderItem } from "react-native";
import { router, Stack } from "expo-router";
import FolderPlus from "lucide-react-native/icons/folder-plus";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import { useSingleFlight } from "@/state/actions";
import {
  Button,
  IconButton,
  ScreenHeading,
  MutationState,
  Notice,
  Screen,
  SearchField,
  Row,
  Sheet,
  SelectField,
  SegmentedControl,
  ToggleField,
} from "@/ui/primitives";
import { useScreenContentInsets } from "@/ui/screen-content-insets";
import { metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { haptic } from "@/ui/motion";
import { SwipeActionsGroup } from "@/ui/swipe-actions";
import type { HostProject } from "@/domain/types";
import type { MobileMachine } from "@/remote/types";
import {
  directorySections,
  directoryRows,
  projectNameContexts,
  PINNED_SECTION_KEY,
  sortDirectoryProjects,
  type DirectoryProject,
  type DirectoryRow,
} from "./project-directory";
import { useProjectDirectory } from "./use-project-directory";
import { GroupLockSection } from "../group-lock/group-lock-section";
import { ProjectFolderBrowser } from "./project-folder-browser";
import { WelcomeScreen } from "../connections/welcome-screen";
import { useProjectActivity } from "./use-project-activity";
import { runningProjectCounts } from "./activity-model";
import { appPreferences, useAppPreferences } from "../navigation-prefs/app-preferences";
import { groupProjectsByRepository } from "./repository-grouping";
import { ProjectGroupHeader, ProjectRow, type ProjectRowView } from "./project-row";
import { ProjectReorderAction, ProjectReorderSheet } from "./project-reorder-sheet";
import {
  applyCustomOrder,
  moveInOrder,
  orderFromSections,
  type ProjectOrderMove,
} from "./project-order";
import { ProjectDetailsSheet } from "./project-details-sheet";
import { latestProjectActivity } from "./project-summaries";
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
  const [refreshing, setRefreshing] = useState(false);
  const {
    preferences,
    hydrated,
    error: preferencesError,
  } = useProjectDirectoryPreferences(machine?.id);
  const [openingId, setOpeningId] = useState<string>();
  const [detailsId, setDetailsId] = useState<string>();
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
  const custom = preferences.sort === "custom";
  const buildSections = useCallback(
    (query: string, collapsed: Readonly<Record<string, boolean>>) => {
      const ordered = sortDirectoryProjects(projects, preferences);
      const sections = directorySections(ordered, groups, query, collapsed, running);
      if (showGroups)
        return custom ? applyCustomOrder(sections, preferences.order, true) : sections;
      const matchingIds = new Set(
        sections.flatMap((section) => section.data.map((project) => project.id)),
      );
      const data = ordered.filter((project) => matchingIds.has(project.id));
      const flat = [
        { key: "", count: data.length, total: data.length, running: 0, expanded: true, data },
      ];
      return custom ? applyCustomOrder(flat, preferences.order, false) : flat;
    },
    [projects, groups, preferences, showGroups, running, custom],
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
  const [reordering, setReordering] = useState(false);
  const reorderSections = useMemo(
    () =>
      reordering
        ? buildSections("", Object.fromEntries(groups.map((group) => [group.id, false])))
        : [],
    [reordering, buildSections, groups],
  );
  const moveOrder = useLatestCallback((move: ProjectOrderMove) => {
    if (!connection.isCurrent()) return;
    const next = moveInOrder(orderFromSections(reorderSections, showGroups), move);
    void projectDirectoryPreferences
      .getState()
      .update(machine.id, (current) => ({
        sort: "custom",
        order: { ...current.order, ...next },
      }));
  });
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
      } catch {
        // The mutation owns failure feedback for both entry points.
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
  const openView = useLatestCallback((id: string, view: ProjectRowView) => {
    const project = projects.find((item) => item.id === id);
    if (project) choose(project, view);
  });
  const showDetails = useLatestCallback((id: string) => {
    if (connection.isCurrent()) setDetailsId(id);
  });
  const details = detailsId ? projects.find((item) => item.id === detailsId) : undefined;
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
  const header = useMemo(
    () => (
      <View style={{ gap: space.xs, paddingBottom: space.sm }}>
        <ScreenHeading
          title={copy("Projeler", "Projects")}
          actions={addInEmptyState ? undefined : (
            <IconButton
              label={copy("Proje ekle", "Add project")}
              disabled={open.isPending || !directoryReady}
              onPress={() => {
                open.reset();
                setAdding(true);
              }}
            >
              <FolderPlus size={20} strokeWidth={2} color={colors.accent} />
            </IconButton>
          )}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SearchField
              label={copy("Projelerinde ara", "Search projects")}
              value={search}
              onChangeText={setSearch}
              placeholder={copy("Proje veya grup ara", "Search project or group")}
            />
          </View>
          <IconButton
            label={copy("Proje görünümü", "Project view")}
            expanded={optionsOpen}
            onPress={() => setOptionsOpen(true)}
          >
            <SlidersHorizontal size={18} color={colors.muted} />
          </IconButton>
        </View>
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
        <GroupLockSection directory={directory} />
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
                ? copy("Sabitlenmiş", "Pinned")
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
          activeAt={activeAt[project.id]}
          opening={openingId === project.id}
          disabled={open.isPending}
          onPress={chooseById}
          onDetails={showDetails}
          onOpenView={openView}
        />
      );
    },
    [
      search,
      preferences,
      running,
      activeAt,
      contexts,
      projectKinds,
      openingId,
      open.isPending,
      showGroups,
      copy,
      updatePreferences,
      chooseById,
      showDetails,
      openView,
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
        title={copy("Proje görünümü", "Project view")}
        size="compact"
        onClose={() => setOptionsOpen(false)}
      >
        <SegmentedControl
          label={copy("Görünüm", "View")}
          value={preferences.view}
          disabled={!hydrated}
          options={[
            { value: "grouped", label: copy("Gruplar", "Groups") },
            { value: "list", label: copy("Liste", "List") },
          ]}
          onChange={(view) => updatePreferences({ view })}
        />
        <ToggleField
          label={copy("Depoya göre grupla", "Group by repository")}
          value={byRepository}
          disabled={!appPrefsHydrated}
          onChange={(groupByRepository) => void appPreferences.getState().update({ groupByRepository })}
        />
        <SelectField
          label={copy("Sıralama", "Sort order")}
          value={preferences.sort}
          disabled={!hydrated}
          options={[
            { value: "desktop", label: copy("Bilgisayardaki sıra", "Computer order") },
            { value: "name", label: copy("Ada göre", "Name") },
            { value: "recent", label: copy("Son açılan", "Recently opened") },
            { value: "custom", label: copy("Özel", "Custom") },
          ]}
          onChange={(sort) => updatePreferences({ sort })}
        />
        <ProjectReorderAction disabled={!hydrated || !!search.trim() || !projects.length} onOpen={() => setReordering(true)} />
        <ToggleField
          label={copy("Tam klasör yolları", "Full folder paths")}
          value={preferences.fullPaths}
          disabled={!hydrated}
          onChange={(fullPaths) => updatePreferences({ fullPaths })}
        />
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
      <ProjectReorderSheet
        visible={reordering}
        sections={reorderSections}
        grouped={showGroups}
        othersLabel={copy("Diğerleri", "Others")}
        pinnedLabel={copy("Sabitlenmiş", "Pinned")}
        onMove={moveOrder}
        onClose={() => setReordering(false)}
      />
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
          onOpenView={(view) => {
            setDetailsId(undefined);
            choose(details, view);
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
