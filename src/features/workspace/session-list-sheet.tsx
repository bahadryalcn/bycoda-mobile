import { FlatList } from "react-native";
import { router } from "expo-router";
import { useMachines } from "@/state/machines";
import { useCopy } from "@/ui/copy";
import { metrics } from "@/ui/tokens";
import { QueryState, Sheet, StateView } from "@/ui/primitives";
import { urgencyGlobalSessionRows } from "./global-session-shelves";
import { queryOwnsRegion } from "./query-region";
import { filterProjectSessionDirectory, listedSession } from "./session-collection";
import { SessionListRow } from "./session-list-row";
import { useProjectActivity } from "./use-project-activity";

/** Portrait tablet session switcher, scoped to the currently active machine. */
export function SessionListSheet({ visible, onClose, machineId, selectedSessionId }: {
  visible: boolean;
  onClose: () => void;
  machineId: string;
  selectedSessionId: string;
}) {
  const copy = useCopy();
  const activeId = useMachines((state) => state.activeId);
  const activity = useProjectActivity();
  const rows = urgencyGlobalSessionRows(
    activeId === machineId ? filterProjectSessionDirectory(activity.projects.data ?? [],
      activity.directory.filter(({ session }) => listedSession(session) && !session.archived), "") : [],
    Date.now(),
  );
  // Loading, connection and read failures fill the sheet like they fill the Sessions list.
  const query = {
    data: activity.directory.length ? activity.directory : undefined,
    isPending: activity.pending,
    error: activity.error,
    isFetching: activity.refreshing,
    refetch: activity.refetch,
  };
  const open = (id: string, projectId: string) => {
    if (useMachines.getState().activeId !== machineId || !activity.projects.isProjectVisible(projectId)) return;
    onClose();
    router.replace({ pathname: "/session/[id]", params: { id, projectId, machineId } });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={copy("Oturumlar", "Sessions")} scroll={false}>
      {/* The non-scrolling sheet body is a definite viewport; the list must fill it to virtualize. */}
      <FlatList style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }} data={rows} keyExtractor={(row) => row.key}
        ListEmptyComponent={queryOwnsRegion(query)
          ? <QueryState query={query} loading="list" loadingLabel={copy("Oturumlar yükleniyor…", "Loading sessions…")} />
          : <StateView illustration="no-sessions" title={copy("Son 7 günde oturum yok", "No sessions in the last 7 days")} />}
        renderItem={({ item }) => {
          if (item.kind !== "session") return null;
          const { project, session } = item;
          return <SessionListRow machineId={machineId} projectId={project.id} projectName={project.name}
            projectCwd={project.cwd} projectAppearance={project.appearance} showProject session={session}
            selected={session.id === selectedSessionId} canRead={activity.projects.isProjectVisible} onPress={open} />;
        }} />
    </Sheet>
  );
}
