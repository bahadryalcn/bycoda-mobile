import { useSessionViewed } from "./use-session-viewed";
import { TranscriptSkeleton } from "./transcript-skeleton";
import { SessionProjectMismatch, foldSessionProject } from "@/remote/session-project";
import { SessionProjectRecovery } from "./session-project-recovery";
import { ProjectDirectoryFeedback } from "./project-directory-feedback";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { setViewingSession } from "../push/push-viewing";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActiveMachine } from "@/state/machines";
import { Empty, QueryState, Screen } from "@/ui/primitives";
import { NoComputerState } from "@/ui/no-computer";
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
import { SessionToolbar } from "./session-toolbar";
import { SessionLoopbackBrowser } from "./session-loopback-browser";
import { SessionTranscript } from "./session-transcript";
import { SectionErrorBoundary } from "@/ui/error-boundary";
import { SessionHeader } from "./session-header";
import { SessionStatusClusterProvider } from "./session-status-cluster-context";
import { SessionListSheet } from "./session-list-sheet";
import { SessionAgentRunsProvider } from "./session-agent-runs";
import { floatingHeaderEstimate, sessionHeaderStatus } from "./session-header-model";
import type { TranscriptView } from "./transcript-model";
import { UncertainCommand, useCommands } from "./shared";
import type { SessionScope, SessionScreenProps, SessionWorkspaceProps } from "./session-types";
import { useProjectList } from "./use-project-directory";
import { sessionPrivacy } from "./session-privacy-model";
import type { CommandReceipt, HostSession } from "./wire";
import {
  acceptedStop,
  failedStop,
  sentStop,
  STOP_RECHECK_MS,
  stopDeadline,
  stopPhase,
  stopUnconfirmedMessage,
  type StopRequest,
} from "./composer-send-presentation";
import { showToast } from "@/ui/toast";
import { sessionIntent } from "@/domain/session-authority";
import { TranscriptScrollPosition } from "./transcript-scroll";
import { goBack, leaveTo } from "@/ui/navigation";

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
    // The route hides the native header, so this state keeps the session header's Back and title.
    return (
      <Screen scroll={false} contentOwnsBottomInset>
        <SessionHeader showBack={layout !== "split"} title={copy("Oturum", "Session")} tone="muted" />
        <View style={{ flex: 1, justifyContent: "center" }}>
          <NoComputerState
            description={copy(
              "Oturumlarını görmek ve başlatmak için bilgisayarını bağla.",
              "Connect your computer to see and start sessions.",
            )}
          />
        </View>
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
  const routeAliases = projects.data?.find((row) => row.id === routeProjectId)?.aliasIds;
  const storedSession = cache.getQueryData<HostSession>(key);
  // A transcript cached before the directory folded its legacy row reads as the listed project.
  const cachedSession =
    storedSession && routeProjectId
      ? foldSessionProject(storedSession, routeProjectId, routeAliases)
      : storedSession;
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
  const dismissComposerSuggestions = useRef<(() => void) | null>(null);
  const loadedBefore = useRef<number | undefined>(undefined);
  const restoreBefore = useCallback(() => loadedBefore.current, []);
  const snapshot = useSessionSnapshot(scope, {
    enabled: privacy.canRead,
    projectId: privacy.projectId,
    projectAliases: projects.data?.find((row) => row.id === privacy.projectId)?.aliasIds,
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
  // A pre-verification list would measure inside display:none. Keep the composer
  // mounted for its draft, and retain the transcript after its first visible layout.
  const transcriptOpened = useRef(false);
  if (visible) transcriptOpened.current = true;
  const retained = useRef<HostSession | undefined>(undefined);
  if (visible) {
    retained.current = snapshot.data;
    loadedBefore.current = snapshot.data?.history?.before ?? 0;
  }
  if (snapshot.parked) retained.current = undefined;
  const session = visible ? snapshot.data : retained.current;
  useSessionViewed(machineId, snapshot.data, visible, canRead, snapshot.streaming);
  const projectId = privacy.projectId ?? session?.projectId;
  const command = useCommands(["session", id, projectId]);
  // Stop has its own command path: a send or another command in flight never holds the session's Stop.
  const stopCommand = useCommands(["session", id, projectId]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [transcriptView, setTranscriptView] = useState<TranscriptView>("messages");
  // Measured by the floating header itself; the estimate covers the first frame only.
  const [headerHeight, setHeaderHeight] = useState(() => floatingHeaderEstimate(insets.top));
  // A cancel whose reply was lost shows its status check, but never holds Stop: another cancel for
  // the same run is harmless on the Host, so Stop stays pressable.
  const stopUncertain = stopCommand.error instanceof UncertainCommand;
  const blocked =
    !visible ||
    command.isPending ||
    stopCommand.isPending ||
    command.error instanceof UncertainCommand ||
    stopUncertain;
  // The one owner of Stop state: the composer and the retry notice both read it. "Stopping" shows
  // from dispatch until the snapshot shows the run ending or a bound passes, and never claims a stop.
  const [stopRequest, setStopRequest] = useState<StopRequest | null>(null);
  const stopRequestNow = useRef<StopRequest | null>(null);
  const updateStop = useCallback((next: (request: StopRequest | null) => StopRequest | null) => {
    stopRequestNow.current = next(stopRequestNow.current);
    setStopRequest(stopRequestNow.current);
  }, []);
  const [stopClock, setStopClock] = useState(0);
  const stopState = stopPhase(stopRequest, session, Math.max(stopClock, Date.now()));
  const stopping = stopState === "sending" || stopState === "settling";
  // Read through refs so a re-render during the wait never restarts its timers.
  const stopPorts = useRef({ refetch: snapshot.refetch, copy });
  stopPorts.current = { refetch: snapshot.refetch, copy };
  const stopNotified = useRef(0);
  useEffect(() => {
    if (!stopRequest) return;
    if (stopState === "idle") {
      // The snapshot left this run: nothing is being waited for any more.
      updateStop((request) => (request === stopRequest ? null : request));
      return;
    }
    if (stopState === "unconfirmed") {
      // A bound passed with the run still going: say so once and leave Stop pressable.
      if (stopNotified.current !== stopRequest.attempt) {
        stopNotified.current = stopRequest.attempt;
        showToast({ tone: "danger", message: stopUnconfirmedMessage(stopRequest, stopPorts.current.copy) });
      }
      return;
    }
    // Judge the bound on a fresh snapshot, so a run that just ended is not reported as still going.
    // The re-read is itself bounded: offline it may never settle, and the spinner must still end.
    let recheck: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      const settle = () => setStopClock(Date.now());
      recheck = setTimeout(settle, STOP_RECHECK_MS);
      void Promise.resolve()
        .then(() => stopPorts.current.refetch())
        .catch(() => {})
        .then(() => {
          clearTimeout(recheck);
          settle();
        });
    }, Math.max(0, (stopDeadline(stopRequest) ?? 0) - Date.now()));
    return () => {
      clearTimeout(timer);
      clearTimeout(recheck);
    };
  }, [stopRequest, stopState, updateStop]);
  const sendCommand = command.mutateAsync;
  const sendStop = stopCommand.mutateAsync;
  const resetCommand = command.reset;
  const resetStop = stopCommand.reset;
  const stopFlight = useRef<Promise<CommandReceipt> | undefined>(undefined);
  const stopAttempts = useRef(0);
  // Only the latest dispatch on a lane clears that lane's settled state.
  const dispatches = useRef({ command: 0, stop: 0 });
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
      const stop = params.type === "cancel";
      // The composer and the transcript share one in-flight Stop while its reply is still awaited.
      // Past that bound a new tap sends a new cancel: a repeat for the same run is harmless.
      if (stop && stopFlight.current && stopPhase(stopRequestNow.current, session, Date.now()) === "sending")
        return stopFlight.current;
      const lane = stop ? "stop" : "command";
      const sequence = ++dispatches.current[lane];
      const runId = stop && typeof params.runId === "string" ? params.runId : undefined;
      const attempt = runId ? ++stopAttempts.current : 0;
      if (runId) updateStop(() => sentStop(runId, attempt, Date.now()));
      const flight = (stop ? sendStop : sendCommand)(intent);
      if (stop) stopFlight.current = flight;
      let receipt: CommandReceipt;
      try {
        receipt = await flight;
      } catch (cause) {
        // Only this attempt's own failure clears the request; a replaced attempt changes nothing.
        if (runId) updateStop((request) => failedStop(request, attempt));
        throw cause;
      } finally {
        if (stopFlight.current === flight) stopFlight.current = undefined;
      }
      if (runId) updateStop((request) => acceptedStop(request, attempt, Date.now()));
      // An accepted command needs no visible receipt: it clears here, after the awaited mutation,
      // whether or not the transcript is mounted. Errors stay for CommandError.
      if (dispatches.current[lane] === sequence) (stop ? resetStop : resetCommand)();
      // The mutation's success already invalidated this session's snapshot; anything else re-reads now.
      if (intent.sessionId !== id) void snapshot.refetch();
      return receipt;
    },
    [sendCommand, sendStop, resetCommand, resetStop, updateStop, cache, machineId, id, privacy.projectId, canRead, session, snapshot.refetch],
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
  // A deleted open session returns to where it was opened from, or to the sessions list.
  const leaveDeleted = () => {
    goBack("/sessions");
  };
  const receiptHandled = () => {
    command.reset();
    refresh();
  };
  const stopReceiptHandled = () => {
    stopCommand.reset();
    refresh();
  };

  if (
    projectMismatch &&
    projects.isProjectVisible(projectMismatch.expectedProjectId) &&
    projects.isProjectVisible(projectMismatch.actualProjectId)
  )
    return (
      <Screen scroll={false} contentOwnsBottomInset>
        <SessionHeader showBack={layout !== "split"} title={copy("Oturum", "Session")} tone="muted" />
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
      <Screen scroll={false} contentOwnsBottomInset>
        {/* The conversation scrolls under the floating header; every region below reserves its
            measured height (the transcript as list padding, the other states as top padding). */}
        <View style={{ flex: 1, minHeight: 0 }}>
        <SessionHeader
          onFloatingHeight={setHeaderHeight}
          showBack={layout !== "split"}
          onShowSessions={layout === "tablet" ? () => setSessionsOpen(true) : undefined}
          title={
            visible && session
              ? session.session.title || copy("Yeni oturum", "New session")
              : copy("Oturum", "Session")
          }
          // Which computer and project this session runs on, read-only, like the scope pills elsewhere.
          context={visible ? [machineName, projectName].filter(Boolean).join(" · ") || undefined : undefined}
          provider={visible ? session?.session.harness : undefined}
          status={layout === "split" && !visible ? undefined : headerStatus.label}
          tone={headerStatus.tone}
          onRefresh={visible && session && (!!snapshot.error || snapshot.fetchStatus === "paused") ? refresh : undefined}
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
                    contextLabel={[machineName, projectName]
                      .filter(Boolean)
                      .join(" · ")}
                    query={{ ...snapshot, data: session }}
                    command={command}
                    blocked={blocked}
                    projectName={projectName}
                    canRead={canRead}
                    onDeleted={leaveDeleted}
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
        {!visible ? (
          <View style={{ flex: 1, paddingTop: headerHeight }}>
            {!projects.directoryReady ? (
              <ProjectDirectoryFeedback
                query={projects.error ? { ...projects, data: undefined } : projects}
                readiness={projects.readiness}
                privacyUnavailable={projects.privacyUnavailable}
                loading="content"
                loadingLabel={copy("Proje doğrulanıyor…", "Verifying project…")}
                shareConnectionFeedback={layout === "split"}
              />
            ) : privacy.canRead ? (
              <QueryState
                query={snapshot}
                loading="centered"
                loadingLabel={copy("Oturum yükleniyor…", "Loading session…")}
                renderLoading={!snapshot.error && !snapshot.failureCount
                  ? (label) => <TranscriptSkeleton label={label} />
                  : undefined}
                shareConnectionFeedback={layout === "split"}
              />
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
                  onPress: () => leaveTo("/sessions"),
                }}
              />
            ) : (
              <Empty
                compact={false}
                illustration="locked"
                title={copy("Proje doğrulanmalı", "Verify the project first")}
                detail={copy(
                  "Projesini doğrulamak için bu oturumu oturum listesinden aç.",
                  "Open this session from the session list to verify its project.",
                )}
                action={{
                  label: copy("Oturumlar", "Sessions"),
                  onPress: () => leaveTo("/sessions"),
                }}
              />
            )}
          </View>
        ) : null}
        <PrivateContentBoundary visible={visible} isAllowed={canRead}>
          <SessionLoopbackBrowser scope={scope} projectId={projectId}>
          {/* One owner for the subagents both the transcript and the composer strip show. */}
          <SessionAgentRunsProvider session={session} scope={scope} disabled={blocked} onCommand={dispatch}>
          <SessionStatusClusterProvider>
          <SessionKeyboardFrame
            composer={
              <SessionComposer
                scope={scope}
                session={session}
                blocked={blocked}
                stopBlocked={!visible}
                stopping={stopping}
                busy={command.isPending}
                onCommand={dispatch}
                outsidePressRef={dismissComposerSuggestions}
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
              <View style={{ flex: 1, paddingTop: headerHeight }}>
                <QueryState query={snapshot} />
              </View>
            ) : transcriptOpened.current ? (
              <View style={{ flex: 1 }} onTouchStart={() => dismissComposerSuggestions.current?.()}>
                {/* A message that fails to render replaces the transcript with Try again, never the
                    whole session: the composer and its draft stay usable. */}
                <SectionErrorBoundary scope="session-transcript">
                <SessionTranscript
                  targetTurnId={targetTurnId}
                  topInset={headerHeight}
                  findOpen={findOpen}
                  onFindOpenChange={setFindOpen}
                  navigation={navigation.current}
                  view={transcriptView}
                  scope={scope}
                  session={session}
                  blocked={blocked}
                  command={command}
                  stopping={stopping}
                  stopError={stopUncertain ? stopCommand.error : null}
                  onCommand={dispatch}
                  onReceiptHandled={receiptHandled}
                  onStopReceiptHandled={stopReceiptHandled}
                  onRefresh={refreshNow}
                />
                </SectionErrorBoundary>
              </View>
            ) : null}
          </SessionKeyboardFrame>
          </SessionStatusClusterProvider>
          </SessionAgentRunsProvider>
          </SessionLoopbackBrowser>
        </PrivateContentBoundary>
        </View>
      </Screen>
    </ComposerTransferProvider>
  );
}
