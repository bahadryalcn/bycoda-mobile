import { useRef, useState } from "react";
import { FlatList } from "react-native";
import { router } from "expo-router";
import { useConnectionScope } from "@/state/connection-scope";
import { useCopy } from "@/ui/copy";
import { metrics } from "@/ui/tokens";
import { QueryState, Sheet, StateView } from "@/ui/primitives";
import { SwipeActionsGroup } from "@/ui/swipe-actions";
import { urgencyGlobalSessionRows } from "./global-session-shelves";
import { directoryOwnsRegion, ProjectDirectoryFeedback } from "./project-directory-feedback";
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
  const connection = useConnectionScope();
  const [reviewedConnection] = useState(() => connection);
  const routed = useRef(false);
  const activity = useProjectActivity();
  const sameComputer = connection.token === reviewedConnection.token && reviewedConnection.review?.id === machineId;
  const canRead = (projectId: string) => visible && sameComputer && reviewedConnection.isCurrent() &&
    activity.projects.isProjectVisible(projectId);
  const listed = sameComputer ? filterProjectSessionDirectory(activity.projects.data ?? [],
    activity.directory.filter(({ session }) => listedSession(session) && !session.archived), "") : [];
  const rows = urgencyGlobalSessionRows(listed, Date.now());
  // Loading, connection and read failures fill the sheet like they fill the Sessions list.
  const query = {
    data: rows.length ? rows : undefined,
    isPending: activity.pending,
    error: activity.error,
    isFetching: activity.refreshing,
    refetch: activity.refetch,
  };
  const feedback = {
    query,
    readiness: activity.readiness,
    privacyUnavailable: activity.privacyUnavailable,
    loading: "list" as const,
    loadingLabel: copy("Oturumlar yükleniyor…", "Loading sessions…"),
  };
  const emptyState = !sameComputer
    ? <StateView title={copy("Bilgisayar bağlantısı değişti.", "Computer connection changed.")} />
    : directoryOwnsRegion(feedback)
      ? <ProjectDirectoryFeedback {...feedback} />
      : listed.length
        // Older sessions exist outside the seven-day window: the full Sessions list reaches them.
        ? <StateView illustration="no-sessions" title={copy("Son 7 günde oturum yok", "No sessions in the last 7 days")}
          action={{ label: copy("Tüm oturumlar", "All sessions"), onPress: () => { onClose(); router.navigate("/chats"); } }} />
        : <StateView illustration="no-sessions" title={copy("Henüz oturum yok.", "No sessions yet.")} />;
  const open = (id: string, projectId: string) => {
    if (routed.current || !canRead(projectId)) return;
    routed.current = true;
    onClose();
    router.replace({ pathname: "/session/[id]", params: { id, projectId, machineId } });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={copy("Oturumlar", "Sessions")} scroll={false}>
      {/* The non-scrolling sheet body is a definite viewport; the list must fill it to virtualize. */}
      <SwipeActionsGroup fill>
      <FlatList style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }} data={rows} keyExtractor={(row) => row.key}
        ListHeaderComponent={rows.length && query.error ? <QueryState query={query} loading="none" compact /> : undefined}
        ListEmptyComponent={emptyState}
        renderItem={({ item }) => {
          if (item.kind !== "session") return null;
          const { project, session } = item;
          return <SessionListRow machineId={machineId} projectId={project.id} projectName={project.name}
            projectCwd={project.cwd} projectAppearance={project.appearance} showProject session={session}
            selected={session.id === selectedSessionId} canRead={canRead} onPress={open} />;
        }} />
      </SwipeActionsGroup>
    </Sheet>
  );
}
