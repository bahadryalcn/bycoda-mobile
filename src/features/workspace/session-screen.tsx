import { useSessionViewed } from "./use-session-viewed";
import { TranscriptSkeleton } from "./transcript-skeleton";
import { SessionProjectMismatch } from "@/remote/session-project";
import { SessionProjectRecovery } from "./session-project-recovery";
import { ProjectDirectoryFeedback } from "./project-directory-feedback";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { setViewingSession } from "../push/push-viewing";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActiveMachine } from "@/state/machines";
import { Empty, QueryState, Screen } from "@/ui/primitives";
import { PrivateContentBoundary } from "@/ui/private-content";
import { hostKey } from "@/state/queries";
import { metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { remoteErrorKind } from "@/ui/error-message";
import { SessionComposer } from "./session-composer";
import { openSessionSeen } from "./session-done-store";
import { ComposerTransferProvider } from "./composer-transfer";
import { SessionKeyboardFrame } from "./session-keyboard-frame";
import { useSessionSnapshot } from "./session-queries";
import { SessionSettings } from "./session-settings";
import { SessionToolbar } from "./session-toolbar";
import { SessionTranscript } from "./session-transcript";
import { SessionHeader } from "./session-header";
import { SessionListSheet } from "./session-list-sheet";
import { SessionParentBar } from "./session-parent-bar";
import { sessionHeaderStatus } from "./session-header-model";
import type { TranscriptView } from "./transcript-model";
import { UncertainCommand, useCommands } from "./shared";
import type { SessionScope, SessionScreenProps, SessionWorkspaceProps } from "./session-types";
import { useProjectList } from "./use-project-directory";
import { sessionPrivacy } from "./session-privacy-model";
import type { HostSession } from "./wire";
import { sessionIntent } from "@/domain/session-authority";
import { TranscriptScrollPosition } from "./transcript-scroll";

export function SessionScreen({ id, projectId, targetTurnId, layout = "phone" }: SessionScreenProps) {
  const machine = useActiveMachine();
  const copy = useCopy();
  const environmentId = machine?.environmentId;
  // Pushes about the conversation on screen are listed without a banner.
  useFocusEffect(
    useCallback(() => {
      if (!environmentId) return;
      setViewingSession({ environmentId, sessionId: id });
      return () => setViewingSession(null);
    }, [environmentId, id]),
  );
  if (!machine) {
    return (
      <Screen>
        <Empty
          compact={false}
          illustration="connect-computer"
          title={copy("Bilgisayara bağlan", "Connect to a computer")}
          action={{
            label: copy("Bilgisayar bağla", "Connect a computer"),
            onPress: () => router.push("/machines"),
          }}
        />
      </Screen>
    );
  }
  return (
    <SessionWorkspace
      key={`${machine.id}:${id}`}
      id={id}
      layout={layout}
      targetTurnId={targetTurnId}
      projectId={projectId}
      machineId={machine.id}
      machineName={machine.name}
    />
  );
}

function SessionWorkspace({
  id,
  projectId: routeProjectId,
  machineId,
  machineName,
  targetTurnId,
  layout = "phone",
}: SessionWorkspaceProps) {
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const scope = useMemo<SessionScope>(() => ({ machineId, sessionId: id }), [machineId, id]);
  // Opening a session from any route (list, notification, link) marks it seen for list ordering.
  useEffect(() => openSessionSeen(machineId, id), [machineId, id]);
  const projects = useProjectList();
  const cache = useQueryClient();
  const key = hostKey(machineId, ["session", id]);
  const projectIdentity = useRef<{ projectId: string; session: { id: string } } | undefined>(
    undefined,
  );
  const cachedSession = cache.getQueryData<HostSession>(key);
  const privacy = sessionPrivacy({
    readable: projects.readable,
    pending: projects.privacyPending,
    projects: projects.data,
    sessionId: id,
    routeProjectId,
    // Retain only the proven mapping after cache eviction. Current directory
    // visibility is still required on every read and command.
    cached: cachedSession ?? projectIdentity.current,
  });
  if (privacy.canRead && privacy.projectId)
    projectIdentity.current = { projectId: privacy.projectId, session: { id } };
  const canRead = useCallback(
    () => !!privacy.projectId && projects.isProjectVisible(privacy.projectId),
    [privacy.projectId, projects.isProjectVisible],
  );
  const navigation = useRef(new TranscriptScrollPosition());
  const loadedBefore = useRef<number | undefined>(undefined);
  const restoreBefore = useCallback(() => loadedBefore.current, []);
  const snapshot = useSessionSnapshot(scope, {
    enabled: privacy.canRead,
    projectId: privacy.projectId,
    canRead,
    restoreBefore,
  });
  // A previously repaired session may be reopened from an old alias link. Recover
  // its navigation identity without exposing the mismatched cached transcript.
  const projectMismatch = useMemo(() => {
    if (
      snapshot.error instanceof SessionProjectMismatch &&
      snapshot.error.expectedProjectId === routeProjectId
    )
      return snapshot.error;
    if (
      privacy.reason === "mismatch" &&
      routeProjectId &&
      cachedSession?.session.id === id &&
      cachedSession.projectId !== routeProjectId
    )
      return new SessionProjectMismatch(id, routeProjectId, cachedSession.projectId);
    return undefined;
  }, [
    snapshot.error,
    privacy.reason,
    routeProjectId,
    cachedSession?.session.id,
    cachedSession?.projectId,
    id,
  ]);
  const visible =
    privacy.visible &&
    !!snapshot.data &&
    snapshot.data.projectId === privacy.projectId &&
    snapshot.data.session.id === id;
  const retained = useRef<HostSession | undefined>(undefined);
  if (visible) {
    retained.current = snapshot.data;
    loadedBefore.current = snapshot.data?.history?.before ?? 0;
  }
  if (snapshot.parked) retained.current = undefined;
  const session = visible ? snapshot.data : retained.current;
  useSessionViewed(machineId, snapshot.data, visible, canRead);
  const projectId = privacy.projectId ?? session?.projectId;
  const command = useCommands(["session", id, projectId]);
  const [settings, setSettings] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [transcriptView, setTranscriptView] = useState<TranscriptView>("messages");
  const blocked = !visible || command.isPending || command.error instanceof UncertainCommand;
  const sendCommand = command.mutateAsync;
  const dispatch = useCallback(
    async (params: Record<string, unknown>) => {
      const state = cache.getQueryState(key);
      const current = cache.getQueryData<HostSession>(key);
      if (
        !canRead() ||
        ["auth", "identity"].includes((state?.error as { kind?: string } | null)?.kind ?? "") ||
        !current ||
        current.projectId !== privacy.projectId ||
        current.session.id !== id
      )
        throw new Error("The session project is no longer available.");
      if (!session) throw new Error("The displayed session is unavailable.");
      const intent = sessionIntent(session, params);
      const receipt = await sendCommand(intent);
      return receipt;
    },
    [sendCommand, cache, machineId, id, privacy.projectId, canRead, session],
  );

  const projectName = projects.data?.find((project) => project.id === projectId)?.name;
  const headerStatus = sessionHeaderStatus(
    session,
    !!snapshot.error,
    copy,
    snapshot.fetchStatus === "paused",
  );
  // Only credential/identity failures need the in-flow state; transient drops show in the header.
  const repairKind = remoteErrorKind(snapshot.error);
  const needsRepair = repairKind === "auth" || repairKind === "identity";
  const refresh = () => {
    void snapshot.refetch();
  };
  // The retry notice reports a failed re-read; a background refetch would only set query.error.
  const refreshNow = async () => {
    const result = await snapshot.refetch();
    if (result.error) throw result.error;
  };
  const receiptHandled = () => {
    command.reset();
    refresh();
  };

  if (
    projectMismatch &&
    projects.isProjectVisible(projectMismatch.expectedProjectId) &&
    projects.isProjectVisible(projectMismatch.actualProjectId)
  )
    return (
      <Screen>
        <SessionProjectRecovery
          error={projectMismatch}
          machineId={machineId}
          visible={projects.isProjectVisible}
          targetTurnId={targetTurnId}
        />
      </Screen>
    );

  return (
    <ComposerTransferProvider scope={scope}>
      <Screen scroll={false}>
        <SessionHeader
          showBack={layout !== "split"}
          onShowSessions={layout === "tablet" ? () => setSessionsOpen(true) : undefined}
          title={
            visible
              ? session?.session.title || copy("Oturum", "Session")
              : copy("Oturum", "Session")
          }
          context={visible ? (projectName ?? machineName) : undefined}
          provider={visible ? session?.session.harness : undefined}
          status={headerStatus.label}
          tone={headerStatus.tone}
          actions={
            visible && session ? (
              <PrivateContentBoundary visible={visible} isAllowed={canRead}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: space.xs,
                  }}
                >
                  <SessionToolbar
                    scope={scope}
                    projectId={projectId}
                    contextLabel={[machineName, projectName ?? projectId]
                      .filter(Boolean)
                      .join(" · ")}
                    query={{ ...snapshot, data: session }}
                    command={command}
                    blocked={blocked}
                    onSettings={() => setSettings(true)}
                    onRefresh={refresh}
                    onCommand={dispatch}
                    onFind={() => setFindOpen(true)}
                    view={transcriptView}
                    onViewChange={setTranscriptView}
                  />
                </View>
              </PrivateContentBoundary>
            ) : null
          }
        />
        {layout === "tablet" && sessionsOpen ? <SessionListSheet visible onClose={() => setSessionsOpen(false)} machineId={machineId} selectedSessionId={id} /> : null}
        {visible ? <SessionParentBar session={session} machineId={machineId} /> : null}
        {!visible ? (
          <View style={{ flex: 1 }}>
            {!projects.directoryReady ? (
              <ProjectDirectoryFeedback
                query={projects.error ? { ...projects, data: undefined } : projects}
                readiness={projects.readiness}
                privacyUnavailable={projects.privacyUnavailable}
                loading="content"
                loadingLabel={copy("Proje doğrulanıyor…", "Verifying project…")}
              />
            ) : privacy.canRead ? (
              snapshot.data === undefined && !snapshot.error ? (
                <TranscriptSkeleton label={copy("Oturum yükleniyor…", "Loading session…")} />
              ) : (
                <QueryState query={snapshot} loading="none" />
              )
            ) : privacy.reason === "hidden" ? (
              <Empty
                compact={false}
                illustration="no-projects"
                title={copy(
                  "Proje bu bilgisayarda bulunamadı.",
                  "Project not found on this computer.",
                )}
                action={{
                  label: copy("Oturumlar", "Sessions"),
                  onPress: () => router.push("/sessions"),
                }}
              />
            ) : (
              <Empty
                compact={false}
                illustration="locked"
                title={copy("Proje doğrulanmalı", "Verify the project first")}
                detail={copy(
                  "Projesini doğrulamak için bu oturumu oturum listesinden açın.",
                  "Open this session from the session list to verify its project.",
                )}
                action={{
                  label: copy("Oturumlar", "Sessions"),
                  onPress: () => router.push("/sessions"),
                }}
              />
            )}
          </View>
        ) : null}
        <PrivateContentBoundary visible={visible} isAllowed={canRead}>
          <SessionKeyboardFrame
            composer={
              <SessionComposer
                scope={scope}
                session={session}
                blocked={blocked}
                busy={command.isPending}
                onCommand={dispatch}
                onOpenSettings={() => setSettings(true)}
              />
            }
            style={{
              flex: 1,
              width: "100%",
              maxWidth: metrics.contentWidth,
              alignSelf: "center",
              paddingLeft: Math.max(insets.left, space.screen),
              paddingRight: Math.max(insets.right, space.screen),
            }}
          >
            {visible && needsRepair ? (
              <View style={{ flex: 1 }}>
                <QueryState query={snapshot} />
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <SessionTranscript
                  targetTurnId={targetTurnId}
                  findOpen={findOpen}
                  onFindOpenChange={setFindOpen}
                  navigation={navigation.current}
                  view={transcriptView}
                  scope={scope}
                  session={session}
                  blocked={blocked}
                  command={command}
                  onCommand={dispatch}
                  onReceiptHandled={receiptHandled}
                  onRefresh={refreshNow}
                />
              </View>
            )}
          </SessionKeyboardFrame>
          {settings && session && projectId ? (
            <SessionSettings
              onClose={() => setSettings(false)}
              value={session}
              projectId={projectId}
              disabled={blocked}
              onCommand={dispatch}
              onUpdated={refresh}
            />
          ) : null}
        </PrivateContentBoundary>
      </Screen>
    </ComposerTransferProvider>
  );
}
