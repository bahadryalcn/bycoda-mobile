import { useMobileTheme } from "@/ui/theme";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import FolderGit2 from "lucide-react-native/icons/folder-git-2";
import Plus from "lucide-react-native/icons/plus";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import { useHostMutation } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import {
  Badge,
  Body,
  Button,
  IconButton,
  LargeTitle,
  MutationState,
  NavigationRow,
  Notice,
  PressableCard,
  QueryState,
  Screen,
  SearchField,
  Row,
  Sheet,
  SelectField,
  SegmentedControl,
  ToggleField,
} from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { colors, metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { haptic } from "@/ui/motion";
import type { HostProject } from "@/domain/types";
import {
  directorySections,
  directoryRows,
  projectPathLabel,
  sortDirectoryProjects,
  type DirectoryProject,
  type DirectoryRow,
} from "./project-directory";
import { useProjectDirectory } from "./use-project-directory";
import { ProjectFolderBrowser } from "./project-folder-browser";
import { WelcomeScreen } from "../connections/welcome-screen";
import { DisclosureChevron } from "@/ui/disclosure-motion";
import { IconTile } from "@/ui/icon-tile";
import { GroupedListRow, rowInset, StatusDot } from "./shared";
import { projectDirectoryPreferences, useProjectDirectoryPreferences, type ProjectDirectoryPreferences } from "@/state/project-directory-preferences";

export function ProjectsScreen() {
  useMobileTheme();
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const machine = useActiveMachine();
  const selectProject = useMachines((state) => state.selectProject);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const { preferences, hydrated, error: preferencesError } = useProjectDirectoryPreferences(machine?.id);
  const [openingId, setOpeningId] = useState<string>();
  const { query, projects, groups, grouped, privacyPending } = useProjectDirectory();
  const open = useHostMutation<HostProject>("projects.open", ["projects"]);
  const showGroups = preferences.view === "grouped" && groups.length > 0;
  const sections = useMemo(() => {
    const ordered = sortDirectoryProjects(projects, preferences);
    const sections = directorySections(ordered, groups, search, showGroups ? preferences.collapsed : Object.fromEntries(groups.map((group) => [group.id, false])));
    if (showGroups) return sections;
    const matchingIds = new Set(sections.flatMap((section) => section.data.map((project) => project.id)));
    const data = ordered.filter((project) => matchingIds.has(project.id));
    return [{ key: "", count: data.length, total: data.length, expanded: true, data }];
  }, [projects, groups, search, preferences, showGroups]);
  const rows = useMemo(() => directoryRows(sections, showGroups), [sections, showGroups]);
  const updatePreferences = (patch: Partial<ProjectDirectoryPreferences>) => {
    if (machine) void projectDirectoryPreferences.getState().update(machine.id, patch);
  };
  const matching = sections.reduce((count, section) => count + section.count, 0);
  const go = (project: HostProject) => {
    if (!machine || useMachines.getState().activeId !== machine.id) return;
    selectProject(project.id);
    router.push({ pathname: "/project/[id]", params: { id: project.id, machineId: machine.id } });
  };
  const choose = (project: DirectoryProject) => {
    if (open.isPending) return;
    if (project.registered) {
      go(project);
      return;
    }
    setOpeningId(project.id);
    void open
      .mutateAsync({ cwd: project.cwd })
      .then((opened) => {
        haptic.success();
        go(opened);
      })
      .catch(() => {})
      .finally(() => setOpeningId(undefined));
  };
  if (!machine) return <WelcomeScreen />;
  const header = (
    <View style={{ gap: space.md, paddingBottom: space.xs }}>
      <LargeTitle
        title={copy("Projeler", "Projects")}
        subtitle={search.trim() ? copy("{p0} sonuç", "{p0} results", { p0: matching }) : copy("{p0} proje", "{p0} projects", { p0: projects.length })}
        actions={
          <>
          <Button label={copy("Görünüm", "View")} tone="quiet" density="compact" onPress={() => setOptionsOpen(true)}>
            <SlidersHorizontal size={16} color={colors.accent} />
          </Button>
          <IconButton
            label={copy("Proje ekle", "Add project")}
            tone="primary"
            disabled={open.isPending}
            onPress={() => {
              open.reset();
              setAdding(true);
            }}
          >
            <Plus size={20} strokeWidth={2.4} color={colors.primaryText} />
          </IconButton>
          </>
        }
      />
      <SearchField
        label={copy("Projelerinde ara", "Search projects")}
        value={search}
        onChangeText={setSearch}
        placeholder={copy("Proje veya grup ara", "Search project or group")}
      />
      {preferencesError ? <Notice tone="warning" message={copy("Liste tercihi kaydedilemedi. Yeniden seçerek dene.", "The list preference could not be saved. Select it again to retry.")} /> : null}
      {!grouped ? (
        <Notice
          tone="info"
          message={copy(
            "Proje gruplarını görmek için bilgisayarındaki bycoda’yı güncelle.",
            "Update bycoda on your computer to show project groups.",
          )}
          onRetry={() => router.push("/machines")}
          retryLabel={copy("Bilgisayarlar", "Computers")}
        />
      ) : null}
      {privacyPending ? (
        <Notice
          tone="info"
          message={copy(
            "Proje listesini eşitlemek için bu bilgisayarda bycoda’yı aç. Korunan gruplar gizli kalır.",
            "Open bycoda on this computer to sync the project directory. Protected groups stay hidden.",
          )}
          onRetry={() => {
            void query.refetch();
          }}
          retryLabel={copy("Yenile", "Refresh")}
        />
      ) : null}
      <MutationState mutation={open} />
      <QueryState
        query={query}
        empty={!privacyPending && !matching}
        emptyTitle={
          search
            ? copy("Aramana uyan proje yok.", "No projects match your search.")
            : copy("Bu bilgisayarda henüz proje yok.", "No projects on this computer yet.")
        }
      />
    </View>
  );
  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: copy("Projeler", "Projects") }} />
      <FlatList<DirectoryRow>
        data={rows}
        keyExtractor={(row) => row.key}
        style={{ flex: 1, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}
        contentContainerStyle={{
          paddingStart: Math.max(space.screen, insets.left),
          paddingEnd: Math.max(space.screen, insets.right),
          paddingTop: space.md,
          paddingBottom: space.lg,
        }}
        ListHeaderComponent={header}
        renderItem={({ item }) => {
          if (item.kind === "group") {
            const section = item.section;
            const expanded = section.expanded;
            const name = section.group?.name ?? copy("Grupsuz", "Ungrouped");
            const count = section.count;
            return (
                <PressableCard
                  label={`${name}. ${count}`}
                  expanded={expanded}
                  onPress={() => {
                    if (search.trim()) return;
                    updatePreferences({ collapsed: { ...preferences.collapsed, [section.key]: expanded } });
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 0,
                    borderTopStartRadius: 0,
                    borderTopEndRadius: 0,
                    borderBottomStartRadius: 0,
                    borderBottomEndRadius: 0,
                    backgroundColor: colors.background,
                    paddingHorizontal: space.lg,
                    paddingVertical: space.sm,
                    marginTop: space.sm,
                    gap: space.sm,
                  }}
                >
                  <StatusDot color={section.group?.color ?? colors.accent} size={8} />
                  <Body
                    style={[uiStyles.grow, uiStyles.sectionLabel, { paddingHorizontal: 0 }]}
                  >
                    {name}
                  </Body>
                  <Body muted style={uiStyles.caption}>{count}</Body>
                  <DisclosureChevron expanded={expanded} color={colors.tertiary} size={14} />
                </PressableCard>
            );
          }
          const project = item.project;
          const color = item.group?.color ?? colors.accent;
          return (
            <View style={{ marginBottom: item.last ? space.sm : 0 }}>
              <GroupedListRow first={item.first} last={item.last} inset={rowInset}>
                    <NavigationRow
                      variant="plain"
                      label={project.name}
                      detail={projectPathLabel(project.cwd, preferences.fullPaths)}
                      detailLines={preferences.fullPaths ? 0 : 1}
                      detailSelectable={false}
                      detailEllipsizeMode="middle"
                      disabled={open.isPending}
                      icon={
                        <IconTile color={color}>
                          <FolderGit2 size={18} strokeWidth={2} color={color} />
                        </IconTile>
                      }
                      trailing={
                        openingId === project.id ? (
                          <Badge label={copy("Açılıyor…", "Opening…")} tone="info" />
                        ) : undefined
                      }
                      onPress={() => choose(project)}
                    />
              </GroupedListRow>
            </View>
          );
        }}
        initialNumToRender={14}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews={false}
        refreshing={!!query.isFetching && !query.isPending}
        onRefresh={() => {
          void query.refetch();
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={false}
        contentInsetAdjustmentBehavior="never"
      />
      <Sheet visible={optionsOpen} title={copy("Proje görünümü", "Project view")} size="compact" onClose={() => setOptionsOpen(false)}>
        <SegmentedControl label={copy("Görünüm", "View")} value={preferences.view} disabled={!hydrated}
          options={[{ value: "grouped", label: copy("Gruplar", "Groups") }, { value: "list", label: copy("Liste", "List") }]}
          onChange={(view) => updatePreferences({ view })} />
        <SelectField label={copy("Sıralama", "Sort order")} value={preferences.sort} disabled={!hydrated}
          options={[
            { value: "desktop", label: copy("Bilgisayardaki sıra", "Computer order") },
            { value: "name", label: copy("Ada göre", "Name") },
            { value: "recent", label: copy("Son açılan", "Recently opened") },
          ]} onChange={(sort) => updatePreferences({ sort })} />
        <ToggleField label={copy("Tam klasör yolları", "Full folder paths")} value={preferences.fullPaths} disabled={!hydrated}
          onChange={(fullPaths) => updatePreferences({ fullPaths })} />
        {showGroups ? <Row>
          <Button label={copy("Tümünü aç", "Expand all")} tone="quiet" onPress={() => updatePreferences({ collapsed: Object.fromEntries([...groups.map((group) => [group.id, false]), ["", false]]) })} />
          <Button label={copy("Tümünü daralt", "Collapse all")} tone="quiet" onPress={() => updatePreferences({ collapsed: Object.fromEntries([...groups.map((group) => [group.id, true]), ["", true]]) })} />
        </Row> : null}
      </Sheet>
      {adding ? (
        <ProjectFolderBrowser
          key={machine.id}
          onClose={() => setAdding(false)}
          mutation={open}
          onOpen={(path) => {
            void open
              .mutateAsync({ cwd: path })
              .then((project) => {
                haptic.success();
                setAdding(false);
                go(project);
              })
              .catch(() => {});
          }}
        />
      ) : null}
    </Screen>
  );
}
