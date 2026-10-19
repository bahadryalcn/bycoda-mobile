import { router, Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import MessageSquare from "lucide-react-native/icons/message-square";
import Plus from "lucide-react-native/icons/plus";
import { FilterButton, FilterSheet } from "@/ui/filter-sheet";
import {
  Body,
  Button,
  Empty,
  IconButton,
  NavigationRow,
  Notice,
  QueryState,
  Row,
  ScreenList,
  SearchField,
  SegmentedControl,
  ToggleField,
  SelectField,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { colors, space } from "@/ui/tokens";
import { useScreenChrome } from "@/ui/layout";
import { IconTile } from "@/ui/icon-tile";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useProjectActivity } from "./use-project-activity";
import { uiStyles } from "@/ui/styles";
import { useMobileTheme } from "@/ui/theme";
import {
  GroupedListRow,
  relativeTime,
  rowInset,
  sessionStatus,
  StatusDot,
} from "./shared";

type StatusFilter = "all" | "running" | "reply";

export function ActiveSessionsScreen({ overview = false }: { overview?: boolean }) {
  useMobileTheme();
  const copy = useCopy();
  const chrome = useScreenChrome();
  const machine = useActiveMachine();
  const activity = useProjectActivity();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [archived, setArchived] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");
  const [filterDraft, setFilterDraft] = useState<{ filter: StatusFilter; archived: boolean; projectId: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newProjectId, setNewProjectId] = useState("");
  const selectedProjectId = useMachines((state) => state.selectedProjectId);
  const projectOptions = (activity.projects.data ?? []).map((project) => ({
    value: project.id,
    label: project.name,
    detail: project.cwd,
  }));
  const creationProject = [newProjectId, projectFilter, selectedProjectId, projectOptions[0]?.value]
    .find((id) => projectOptions.some((project) => project.value === id));
  const directory = overview ? activity.directory : activity.sessions;
  const visible = directory.filter(
    ({ project, session }) =>
      (!overview || Boolean(session.archived) === archived) &&
      (!projectFilter || project.id === projectFilter) &&
      (archived ||
        filter === "all" ||
        (filter === "reply" ? session.needsInput : session.status === "running")) &&
      `${project.name} ${session.title} ${session.harness} ${session.branch ?? ""} ${session.model ?? ""}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const title = overview ? copy("Oturumlar", "Sessions") : copy("Aktif oturumlar", "Active sessions");
  const newSessionButton = overview ? (
    <IconButton
      label={copy("Yeni oturum", "New session")}
      tone="primary"
      disabled={!projectOptions.length || activity.privacyPending}
      onPress={() => setCreating(true)}
    >
      <Plus size={20} strokeWidth={2.4} color={colors.primaryText} />
    </IconButton>
  ) : null;
  const actions = overview ? (
    <Row style={{ gap: space.xs, flexWrap: "nowrap" }}>
      <FilterButton count={Number(!archived && filter !== "all") + Number(archived) + Number(!!projectFilter)}
        onPress={() => setFilterDraft({ filter, archived, projectId: projectFilter })} />
      {newSessionButton}
    </Row>
  ) : undefined;
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
      data={visible}
      keyExtractor={({ project, session }) => `${project.id}:${session.id}`}
      title={title}
      actions={actions}
      refresh={activity.refetch}
      query={{ ...activity.projects, isFetching: activity.refreshing, isPending: activity.pending }}
      header={
        <>
          <Stack.Screen options={{ title }} />
          {chrome.nativeTitle ? (
            <Row style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
              <Body muted style={uiStyles.caption}>
                {machine.name}
              </Body>
              {actions}
            </Row>
          ) : null}
          <SearchField
            label={copy("Oturum ara", "Search sessions")}
            value={search}
            onChangeText={setSearch}
            placeholder={copy("Proje veya oturum", "Project or session")}
          />
          {projectFilter ? <Body muted style={uiStyles.caption}>
            {projectOptions.find((project) => project.value === projectFilter)?.label ?? projectFilter}
          </Body> : null}
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
              data: activity.sessions.length ? activity.sessions : undefined,
              isPending: activity.pending,
              error: activity.error,
              refetch: activity.refetch,
            }}
            loading="list"
          />
          {activity.privacyPending ? (
            <Notice
              tone="info"
              message={copy(
                "Oturumları görmek için bilgisayarda bycoda’yı aç ve proje listesini eşitle.",
                "Open bycoda on the computer and sync the project directory to see sessions.",
              )}
              onRetry={() => {
                void activity.refetch();
              }}
            />
          ) : !activity.complete && !activity.pending && !activity.error ? (
            <Notice
              tone="warning"
              message={copy(
                "Bazı projelerin oturumları henüz alınamadı.",
                "Sessions from some projects are not available yet.",
              )}
              onRetry={() => {
                void activity.refetch();
              }}
            />
          ) : null}
          {activity.complete && !visible.length ? (
            <Empty
              title={
                search
                  ? copy("Aramana uyan oturum yok.", "No sessions match your search.")
                  : overview
                    ? archived
                      ? copy("Arşivlenmiş oturum yok.", "No archived sessions.")
                      : copy("Henüz oturum yok.", "No sessions yet.")
                    : copy("Aktif oturum yok", "No active sessions")
              }
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
              onChange={setNewProjectId}
            />
            <Button
              label={copy("Yeni oturum", "New session")}
              tone="primary"
              disabled={!creationProject || activity.privacyPending}
              onPress={() => {
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
      renderItem={({ item: { project, session }, index }) => {
        const status = sessionStatus(session, copy);
        return (
          <GroupedListRow
            first={index === 0}
            last={index === visible.length - 1}
            inset={rowInset}
          >
            <NavigationRow
              variant="plain"
              label={session.title || copy("Yeni oturum", "New session")}
              detail={[status.label, project.name, session.harness].join(" · ")}
              icon={
                <IconTile color={status.color}>
                  <MessageSquare size={18} strokeWidth={2} color={status.color} />
                </IconTile>
              }
              trailing={
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                  <StatusDot color={status.color} />
                  <Body muted style={uiStyles.caption}>
                    {relativeTime(session.updatedAt, copy)}
                  </Body>
                </View>
              }
              onPress={() => {
                if (machine)
                  router.push({
                    pathname: "/session/[id]",
                    params: { id: session.id, projectId: project.id, machineId: machine.id },
                  });
              }}
            />
          </GroupedListRow>
        );
      }}
    />
  );
}
