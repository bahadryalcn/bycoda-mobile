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
  Button,
  Heading,
  SearchField,
  MutationState,
  NavigationRow,
  Notice,
  PressableCard,
  QueryState,
  Row,
  Screen,
  Separator,
} from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { colors, metrics, radii, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
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

export function ProjectsScreen() {
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
      .then(go)
      .catch(() => {})
      .finally(() => setOpeningId(undefined));
  };
  if (!machine) return <WelcomeScreen />;
  const header = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
          <Heading>{copy("Projeler", "Projects")}</Heading>
          {query.isSuccess && !privacyPending ? (
            <Body muted style={uiStyles.caption}>
              {copy("{p0} proje", "{p0} projects", { p0: projects.length })}
            </Body>
          ) : null}
        </View>
        <Button
          label={copy("Proje ekle", "Add project")}
          tone="primary"
          disabled={open.isPending}
          onPress={() => {
            open.reset();
            setAdding(true);
          }}
        >
          <Plus size={16} color={colors.primaryText} />
        </Button>
      </Row>
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
          const expanded = !!search.trim() || !collapsed[`${machine.id}:${section.key}`];
          const color = section.group?.color ?? colors.accent;
          return (
            <View
              style={{
                backgroundColor: colors.panel,
                borderWidth: 0,
                borderColor: colors.separator,
                borderRadius: radii.card,
                overflow: "hidden",
                marginBottom: space.md,
              }}
            >
              {groups.length || section.group ? (
                <PressableCard
                  label={section.group?.name ?? copy("Grupsuz", "Ungrouped")}
                  expanded={expanded}
                  onPress={() => {
                    if (search.trim()) return;
                    const key = `${machine.id}:${section.key}`;
                    setCollapsed((values) => ({ ...values, [key]: expanded }));
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 0,
                    borderRadius: radii.badge,
                    paddingVertical: space.sm,
                    gap: space.sm,
                  }}
                >
                  <View
                    style={{
                      width: 3,
                      height: 20,
                      backgroundColor: color,
                      borderRadius: radii.badge,
                    }}
                  />
                  <Body numberOfLines={1} style={[uiStyles.grow, uiStyles.label]}>
                    {section.group?.name ?? copy("Grupsuz", "Ungrouped")}
                  </Body>
                  <Body muted style={uiStyles.caption}>
                    {String(search.trim() ? section.count : section.total)}
                  </Body>
                  <DisclosureChevron expanded={expanded} color={colors.muted} />
                </PressableCard>
              ) : null}
              <DisclosureBody expanded={expanded}>
                {section.data.map((item, index) => (
                  <View key={item.id}>
                    {index || groups.length || section.group ? (
                      <Separator style={{ marginHorizontal: space.md }} />
                    ) : null}
                    <NavigationRow
                      label={item.name}
                      detail={item.cwd}
                      detailSelectable={false}
                      detailEllipsizeMode="middle"
                      variant="plain"
                      disabled={open.isPending}
                      icon={
                        <IconTile color={colors.separator}>
                          <FolderGit2 size={20} color={color} />
                        </IconTile>
                      }
                      trailing={
                        openingId === item.id ? (
                          <Badge label={copy("Açılıyor…", "Opening…")} tone="info" />
                        ) : undefined
                      }
                      onPress={() => choose(item)}
                    />
                  </View>
                ))}
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
