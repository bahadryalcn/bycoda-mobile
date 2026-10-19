import { useMobileTheme } from "@/ui/theme";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import FolderGit2 from "lucide-react-native/icons/folder-git-2";
import Plus from "lucide-react-native/icons/plus";
import { useHostMutation } from "@/state/queries";
import { useActiveMachine, useMachines } from "@/state/machines";
import {
  Badge,
  Body,
  IconButton,
  LargeTitle,
  MutationState,
  NavigationGroup,
  NavigationRow,
  Notice,
  PressableCard,
  QueryState,
  Screen,
  SearchField,
} from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { colors, metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { haptic } from "@/ui/motion";
import type { HostProject } from "@/domain/types";
import {
  directorySections,
  type DirectoryProject,
  type DirectorySection,
} from "./project-directory";
import { useProjectDirectory } from "./use-project-directory";
import { ProjectFolderBrowser } from "./project-folder-browser";
import { WelcomeScreen } from "../connections/welcome-screen";
import { DisclosureBody, DisclosureChevron } from "@/ui/disclosure-motion";
import { IconTile } from "@/ui/icon-tile";
import { StatusDot } from "./shared";

export function ProjectsScreen() {
  useMobileTheme();
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const machine = useActiveMachine();
  const selectProject = useMachines((state) => state.selectProject);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [openingId, setOpeningId] = useState<string>();
  const { query, projects, groups, grouped, privacyPending } = useProjectDirectory();
  const open = useHostMutation<HostProject>("projects.open", ["projects"]);
  const sections = useMemo(
    () => directorySections(projects, groups, search, {}),
    [projects, groups, search],
  );
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
        subtitle={
          query.isSuccess && !privacyPending
            ? copy("{p0} proje", "{p0} projects", { p0: projects.length })
            : undefined
        }
        actions={
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
        }
      />
      <SearchField
        label={copy("Projelerinde ara", "Search projects")}
        value={search}
        onChangeText={setSearch}
        placeholder={copy("Proje veya grup ara", "Search project or group")}
      />
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
      {search.trim() && matching ? (
        <Body muted style={uiStyles.caption}>
          {copy("{p0} sonuç", "{p0} results", { p0: matching })}
        </Body>
      ) : null}
    </View>
  );
  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: copy("Projeler", "Projects") }} />
      <FlatList<DirectorySection>
        data={sections}
        keyExtractor={(section) => section.key}
        style={{ flex: 1, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}
        contentContainerStyle={{
          paddingStart: Math.max(space.screen, insets.left),
          paddingEnd: Math.max(space.screen, insets.right),
          paddingTop: space.md,
          paddingBottom: space.lg,
        }}
        ListHeaderComponent={header}
        renderItem={({ item: section }) => {
          const key = `${machine.id}:${section.key}`;
          const expanded = !!search.trim() || !collapsed[key];
          const color = section.group?.color ?? colors.accent;
          const name = section.group?.name ?? copy("Grupsuz", "Ungrouped");
          const count = search.trim() ? section.count : section.total;
          return (
            <View style={{ marginBottom: space.lg }}>
              {groups.length || section.group ? (
                <PressableCard
                  label={`${name}. ${count}`}
                  expanded={expanded}
                  onPress={() => {
                    if (search.trim()) return;
                    setCollapsed((values) => ({ ...values, [key]: expanded }));
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
                    gap: space.sm,
                  }}
                >
                  <StatusDot color={color} size={9} />
                  <Body
                    numberOfLines={1}
                    style={[uiStyles.grow, uiStyles.sectionLabel, { paddingHorizontal: 0 }]}
                  >
                    {name}
                  </Body>
                  <Badge label={String(count)} />
                  <DisclosureChevron expanded={expanded} color={colors.tertiary} size={14} />
                </PressableCard>
              ) : null}
              <DisclosureBody expanded={expanded}>
                <NavigationGroup>
                  {section.data.map((item) => (
                    <NavigationRow
                      key={item.id}
                      label={item.name}
                      detail={item.cwd}
                      detailSelectable={false}
                      detailEllipsizeMode="middle"
                      disabled={open.isPending}
                      icon={
                        <IconTile color={section.group?.color ?? colors.accent}>
                          <FolderGit2 size={18} strokeWidth={2} color={color} />
                        </IconTile>
                      }
                      trailing={
                        openingId === item.id ? (
                          <Badge label={copy("Açılıyor…", "Opening…")} tone="info" />
                        ) : undefined
                      }
                      onPress={() => choose(item)}
                    />
                  ))}
                </NavigationGroup>
              </DisclosureBody>
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
