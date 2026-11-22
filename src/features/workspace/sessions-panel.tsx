import { sessionIsSnoozed } from "./session-attention-model";
import { useSnoozeNow } from "./session-clock";
import { useHostReadActive } from "@/state/queries";
import { HierarchyFrame, HierarchyWidthProvider } from "@/ui/hierarchy-frame";
import { useMobileTheme } from "@/ui/theme";
import { sameSessionListConnectionFailure } from "./session-list-feedback";
import type { ProjectSessionsProps, SessionCreationDraft } from "./sessions-panel-types";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLatestCallback } from "./use-latest-callback";
import { View } from "react-native";
import { carryCrossDelegation } from "../../../../src/shared/model/host-contracts/delegation";
import { space } from "@/ui/tokens";
import { router } from "expo-router";
import { useFormDraft } from "@/state/form-draft";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import { useHostClient, useHostQuery } from "@/state/queries";
import { useCreateSession } from "./use-create-session";
import { useScreenContentInsets } from "@/ui/screen-content-insets";
import { Body, Button, FormActions, Sheet, SearchField, ScreenList, QueryState } from "@/ui/primitives";
import { getQueryPresentation } from "@/ui/query-presentation";
import { useCopy } from "@/ui/copy";
import { SwipeActionsGroup } from "@/ui/swipe-actions";
import { PermissionField } from "./agent-option-icons";
import { selectedChoice } from "./provider-choices";
import { SessionListRow } from "./session-list-row";
import { CommandError, ErrorText } from "./shared";
import { AgentModelFields } from "./agent-model-fields";
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
  const form = useFormDraft<SessionCreationDraft>({ provider: undefined, model: "" });
  const { provider, model } = form.values;
  const [modelSettings, setModelSettings] = useState<Record<string, string>>({});
  const [runtimeMode, setRuntimeMode] = useState<
    "supervised" | "auto-accept-edits" | "auto" | "full-access"
  >("supervised");
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
  const { catalog, command, locked, choices, selection, canStart, create } = useCreateSession(
    projectId,
    {
      cwd,
      catalogEnabled: creating,
      draft: { provider, accountId: form.values.accountId, model },
    },
  );
  const { selectedProvider, selectedAccountId, models, selectedModel, bundled } = selection;
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
    if (readable() && !locked) setCreating(true);
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
          : showEmptyCreate && !locked
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
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: space.sm }}>
                <Body accessibilityRole="header" style={{ flexShrink: 1 }}>
                  {copy("Arşivlenmiş oturumlar", "Archived sessions")}
                </Body>
                <Button
                  label={copy("Etkin oturumlar", "Active sessions")}
                  tone="quiet"
                  onPress={() => { if (readable()) setArchived(false); }}
                />
              </View>
            ) : null}
            {searchOpen ? (
              <SearchField
                label={copy("Oturum ara", "Search sessions")}
                autoFocus
                value={search}
                onChangeText={setSearch}
              />
            ) : null}
            {creating ? (
              <Sheet
                visible
                size="form"
                dismissible={!locked}
                dirty={
                  form.dirty ||
                  Object.keys(modelSettings).length > 0 ||
                  runtimeMode !== "supervised"
                }
                title={copy("Yeni oturum", "New session")}
                onClose={() => {
                  if (!locked) {
                    setCreating(false);
                    form.reset({ provider: undefined, accountId: undefined, model: "" });
                    setModelSettings({});
                    setRuntimeMode("supervised");
                  }
                }}
              >
                <View style={uiStyles.stack}>
                  {cwd ? (
                    <Body
                      mono
                      muted
                      selectable
                      style={uiStyles.caption}
                    >{`${copy("Çalışma klasörü:", "Working folder:")} ${cwd}`}</Body>
                  ) : null}
                  <QueryState query={catalog} loading="inline" />
                  {selectedProvider && catalog.data?.errors[selectedProvider] ? (
                    <ErrorText error={catalog.data.errors[selectedProvider]} />
                  ) : null}
                  {bundled ? (
                    <Body muted>
                      {copy(
                        "Yerleşik model listesi gösteriliyor. Kullanılabilirlik bilgisayarındaki sağlayıcıya bağlıdır.",
                        "Showing bundled models. Availability depends on the provider on your computer.",
                      )}
                    </Body>
                  ) : null}
                  <AgentModelFields
                    catalog={catalog.data}
                    models={models}
                    model={selectedModel}
                    settings={modelSettings}
                    sparseSettings
                    provider={{
                      choices,
                      value: selectedChoice(choices, selectedProvider, selectedAccountId),
                      onChange: (next) => {
                        form.patch(
                          next.provider === selectedProvider
                            ? { accountId: next.accountId }
                            : { provider: next.provider, accountId: next.accountId, model: "" },
                        );
                        if (next.provider !== selectedProvider) setModelSettings(previous => carryCrossDelegation(previous, {}));
                      },
                    }}
                    disabled={locked}
                    onChange={(next, settings) => {
                      form.setField("model", next);
                      setModelSettings(settings);
                    }}
                  />
                  <PermissionField
                    value={runtimeMode}
                    disabled={locked}
                    onChange={setRuntimeMode}
                  />
                  {runtimeMode === "supervised" ? (
                    <Body muted style={uiStyles.caption}>
                      {copy(
                        "Başlangıçta komut ve dosya değişiklikleri için onay istenir. Oturum ayarlarından değiştirebilirsin.",
                        "Commands and file changes ask for approval initially. You can change this in session settings.",
                      )}
                    </Body>
                  ) : null}
                  <CommandError
                    error={command.error}
                    onDismiss={() => command.reset()}
                    onRecovered={(receipt) => {
                      if (!readable()) return;
                      command.reset();
                      openSession(receipt.sessionId);
                    }}
                  />
                  <FormActions
                    submitLabel={copy("Oturumu başlat", "Start session")}
                    tone="primary"
                    disabled={!canStart}
                    busy={command.isPending}
                    onSubmit={() => {
                      if (readable()) void create(openSession, { settings: modelSettings, runtimeMode });
                    }}
                  />
                </View>
              </Sheet>
            ) : null}
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
      if (readable()) setSearchOpen((value) => !value);
    },
    showCreateInHeader: !showEmptyCreate && (listQuery.data !== undefined || presentation === "error"),
    createDisabled: locked,
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
