import { router, Stack } from "expo-router";
import { useState } from "react";
import MessageSquare from "lucide-react-native/icons/message-square";
import {
  Badge,
  Body,
  Empty,
  SearchField,
  NavigationRow,
  Notice,
  QueryState,
  ScreenList,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { colors } from "@/ui/tokens";
import { useActiveMachine } from "@/state/machines";
import { useProjectActivity } from "./use-project-activity";
import { uiStyles } from "@/ui/styles";

export function ActiveSessionsScreen() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const activity = useProjectActivity();
  const [search, setSearch] = useState("");
  const visible = activity.sessions.filter(({ project, session }) =>
    `${project.name} ${session.title} ${session.harness}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <ScreenList
      data={visible}
      keyExtractor={({ project, session }) => `${project.id}:${session.id}`}
      title={copy("Aktif oturumlar", "Active sessions")}
      refresh={activity.refetch}
      query={{ ...activity.projects, isFetching: activity.refreshing, isPending: activity.pending }}
      header={
        <>
          <Stack.Screen options={{ title: copy("Aktif oturumlar", "Active sessions") }} />
          <Body muted style={uiStyles.caption}>
            {machine?.name}
            {activity.complete || activity.sessions.length
              ? ` · ${activity.sessions.length} ${copy("aktif", "active")}`
              : ""}
          </Body>
          <SearchField
            label={copy("Oturum ara", "Search sessions")}
            value={search}
            onChangeText={setSearch}
            placeholder={copy("Proje veya oturum", "Project or session")}
          />
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
                  : copy("Aktif oturum yok", "No active sessions")
              }
            />
          ) : null}
        </>
      }
      renderItem={({ item: { project, session } }) => (
        <NavigationRow
          key={session.id}
          label={session.title || copy("Yeni oturum", "New session")}
          detail={`${project.name} · ${session.harness}`}
          icon={<MessageSquare size={19} color={colors.muted} />}
          trailing={
            <Badge
              label={session.needsInput ? copy("Yanıt", "Reply") : copy("Çalışıyor", "Running")}
              tone={session.needsInput ? "warning" : "active"}
            />
          }
          onPress={() => {
            if (machine)
              router.push({
                pathname: "/session/[id]",
                params: { id: session.id, projectId: project.id, machineId: machine.id },
              });
          }}
        />
      )}
    />
  );
}
