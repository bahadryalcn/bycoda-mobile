import { sessionIsSnoozed } from "./session-attention-model";
import { useSnoozeNow } from "./session-clock";
import { useHostReadActive } from "@/state/queries";
import { HierarchyFrame, HierarchyWidthProvider } from "@/ui/hierarchy-frame";
import { useMobileTheme } from "@/ui/theme";
import { sameSessionListConnectionFailure } from "./session-list-feedback";
import type { ProjectSessionsProps } from "./sessions-panel-types";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLatestCallback } from "./use-latest-callback";
import { View } from "react-native";
import { space } from "@/ui/tokens";
import { router } from "expo-router";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import { useHostClient, useHostQuery } from "@/state/queries";
import { NewSessionSheet } from "./new-session-sheet";
import { useScreenContentInsets } from "@/ui/screen-content-insets";
import { Button, SectionHeader, SearchField, ScreenList, QueryState } from "@/ui/primitives";
import { getQueryPresentation } from "@/ui/query-presentation";
import { useCopy } from "@/ui/copy";
import { SwipeActionsGroup } from "@/ui/swipe-actions";
import { SessionListRow } from "./session-list-row";
import type { HostSessionSummary } from "./wire";
import { filterSessionDirectory, toggleSessionDirectoryFolder } from "./session-directory";
import { projectSessionRows, type ProjectSessionRow } from "./project-session-shelves";
import { useUnseenDoneIds } from "./session-done-store";
import { SessionShelfHeader } from "./session-shelf-header";
import { listedProjectSession, type SessionShelfId } from "./session-collection";
import { SessionFolderRow } from "./session-folder-row";
import { queryOwnsRegion } from "./query-region";
import { sessionListPollInterval } from "./session-list-poll";

export function ProjectSessions(props: ProjectSessionsProps) {
  const connection = useConnectionScope();
  const scopeKey = JSON.stringify([connection.token, props.projectId, props.cwd]);
  const [firstScopeKey] = useState(scopeKey);
  return <ProjectSessionsConnection key={scopeKey} {...props} connection={connection}
    initialCreating={props.initialCreating && scopeKey === firstScopeKey} />;
}

function ProjectSessionsConnection({
  projectId,
  cwd,
  initialCreating = false,
  sessionLayout,
  directoryQuery,
  projectName,
  projectCwd,
  canReadProject,
  renderFrame,
  connection,
}: ProjectSessionsProps & { connection: ConnectionScope }) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const insets = useScreenContentInsets();
  const mounted = useRef(true);
  // Retire queued row and form actions as soon as this project pane unmounts.
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const readable = useLatestCallback(() => mounted.current && !!machine && connection.isCurrent() && canReadProject());
  const openSession = useLatestCallback((sessionId: string) => {
    if (!machine || !readable()) return;
    setCreating(false);
    router.navigate({
      pathname: "/session/[id]",
      params: { id: sessionId, projectId, machineId: machine.id },
    });
  });
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [archived, setArchived] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [shelfCollapsed, setShelfCollapsed] = useState<Partial<Record<SessionShelfId, boolean>>>(
    {},
  );
  const [creating, setCreating] = useState(initialCreating);
  const client = useHostClient();
  // Live project streams already deliver session summaries; poll the full list only when they
  // are down. The interval is re-evaluated after each fetch, so a dropped stream resumes 5s polling.
  const sessionPollMs = () =>
    sessionListPollInterval(
      !!client?.supportsStreams?.(),
      client?.connectionState?.(),
      !!directoryQuery?.error,
    );
  const sessions = useHostQuery<HostSessionSummary[]>(
    ["sessions", projectId],
    "sessions.list",
    { projectId },
    { interval: sessionPollMs },
  );
  const lifecycle = useHostQuery<{ records: { sessionId: string; state: string }[] }>(
    ["sessions-lifecycle", projectId],
    "sessions.lifecycle.list",
    {},
    { enabled: !archived, interval: 15_000 },
  );
  const settledIds = useMemo(
    () =>
      new Set(
        (lifecycle.data?.records ?? [])
          .filter((r) => r.state === "settled")
          .map((r) => r.sessionId),
      ),
    [lifecycle.data],
  );
  const attentionNow = useSnoozeNow(useHostReadActive(), (sessions.data ?? []).map(session => session.snoozedUntil));
  const visible = filterSessionDirectory(
    (sessions.data ?? []).filter(
      (session) => Boolean(session.archived) === archived && listedProjectSession(session),
    ),
    sessionLayout,
    search,
    "",
    copy("Yeni oturum", "New session"),
  );
  const doneIds = useUnseenDoneIds(machine?.id ?? "");
  const rows = projectSessionRows(
    visible,
    sessionLayout,
    collapsed,
    shelfCollapsed,
    !!search.trim(),
    settledIds,
    archived,
    { doneIds, now: attentionNow },
  );
  const sharedConnectionFailure = sameSessionListConnectionFailure(
    directoryQuery?.error,
    sessions.error,
  );
  const listQuery = sharedConnectionFailure
    ? {
        ...sessions,
        isFetching: sessions.isFetching || directoryQuery?.isFetching,
        refetch: () => Promise.all([sessions.refetch(), directoryQuery?.refetch?.()]),
      }
    : sessions;
  const emptyTitle = search.trim()
    ? copy("Aramana uyan oturum yok.", "No sessions match your search.")
    : archived
      ? copy("Arşivlenmiş oturum yok.", "No archived sessions.")
      : copy("Henüz oturum yok.", "No sessions yet.");
  const ownsRegion = queryOwnsRegion(listQuery, !visible.length);
  const presentation = getQueryPresentation(listQuery, !visible.length);
  const showEmptyCreate = presentation === "empty" && !search.trim() && !archived;
  const openCreate = () => {
    if (readable()) setCreating(true);
  };
  const listState = (
    <QueryState
      query={listQuery}
      loading="list"
      loadingLabel={copy("Oturumlar yükleniyor…", "Loading sessions…")}
      empty={!visible.length ? emptyTitle : undefined}
      emptyIllustration={search.trim() ? "search-empty" : archived ? "inbox-empty" : "no-sessions"}
      emptyDetail={
        !search.trim() && !archived
          ? copy("Bu projede ilk oturumunu başlat.", "Start the first session in this project.")
          : undefined
      }
      emptyAction={
        search.trim()
          ? {
              label: copy("Aramayı temizle", "Clear search"),
              onPress: () => setSearch(""),
            }
          : showEmptyCreate
            ? {
                label: copy("Yeni oturum", "New session"),
                onPress: openCreate,
              }
            : undefined
      }
    />
  );
  const content = (
    <HierarchyWidthProvider>
      <SwipeActionsGroup fill>
      <ScreenList<ProjectSessionRow>
        grouped
        data={rows}
        keyExtractor={(row) => row.key}
        query={sessions}
        contentContainerStyle={{ gap: 0, paddingBottom: insets.bottom }}
        ListEmptyComponent={ownsRegion ? listState : undefined}
        ListHeaderComponent={
          <View style={[uiStyles.stack, { gap: space.sm }]}>
            {archived ? (
              <SectionHeader flush title={copy("Arşivlenmiş oturumlar", "Archived sessions")}
                trailing={<Button
                  label={copy("Etkin oturumlar", "Active sessions")}
                  tone="quiet"
                  density="compact"
                  onPress={() => { if (readable()) setArchived(false); }}
                />} />
            ) : null}
            {/* Always visible, like the Sessions tab; refresh is pull-to-refresh. */}
            <SearchField
              label={copy("Oturum ara", "Search sessions")}
              value={search}
              onChangeText={setSearch}
            />
            {/* The one new-session editor, with this project (and worktree folder) preselected. */}
            <NewSessionSheet visible={creating} project={{ id: projectId, cwd }} onClose={() => setCreating(false)} />
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === "header")
            return (
              <SessionShelfHeader
                row={item}
                onToggle={(shelf) => {
                  if (!search.trim())
                    setShelfCollapsed((current) => ({ ...current, [shelf]: item.expanded }));
                }}
              />
            );
          if (item.kind === "folder")
            return (
              <SessionFolderRow
                row={item}
                projectId={projectId}
                onToggle={() =>
                  setCollapsed((current) =>
                    toggleSessionDirectoryFolder(current, item, !!search.trim()),
                  )
                }
              />
            );
          const session = item.session;
          return (
            <HierarchyFrame depth={item.depth} reservedWidth={space.sm * 2}>
              {({ indent, compressed }) => (
                <View style={{ paddingStart: indent }}>
                  <SessionListRow
                    machineId={machine?.id ?? ""}
                    projectId={projectId}
                    projectName={projectName}
                    projectCwd={projectCwd ?? cwd}
                    session={session}
                    ancestors={item.ancestors}
                    compressed={compressed}
                    canRead={readable}
                    snoozed={sessionIsSnoozed(session, attentionNow)}
              settled={settledIds.has(session.id)}
                    onPress={openSession}
                  />
                </View>
              )}
            </HierarchyFrame>
          );
        }}
      />
      </SwipeActionsGroup>
    </HierarchyWidthProvider>
  );
  return renderFrame(<View style={{ flex: 1 }}>{content}</View>, {
    searchOpen,
    hasSearch: !!search.trim(),
    toggleSearch: () => {
      if (!readable()) return;
      // A closed field must not keep filtering the list out of sight.
      if (searchOpen) setSearch("");
      setSearchOpen(!searchOpen);
    },
    showCreateInHeader: !showEmptyCreate && (listQuery.data !== undefined || presentation === "error"),
    createDisabled: false,
    create: openCreate,
    archived,
    toggleArchived: () => {
      if (readable()) setArchived((value) => !value);
    },
    refreshing: sessions.isFetching,
    refresh: () => {
      if (readable() && !sessions.isFetching) void sessions.refetch();
    },
  });
}
