import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActiveMachine } from "@/state/machines";
import { Empty, Notice, QueryState, Screen } from "@/ui/primitives";
import { PrivateContentBoundary } from "@/ui/private-content";
import { hostKey } from "@/state/queries";
import { metrics, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { SessionComposer } from "./session-composer";
import { ComposerTransferProvider } from "./composer-transfer";
import { SessionKeyboardFrame } from "./session-keyboard-frame";
import { useSessionSnapshot } from "./session-queries";
import { SessionSettings } from "./session-settings";
import { SessionToolbar } from "./session-toolbar";
import { SessionTranscript } from "./session-transcript";
import { TranscriptViewFilter } from "./transcript-view-filter";
import type { TranscriptView } from "./transcript-model";
import { UncertainCommand, useCommands } from "./shared";
import type { SessionScope, SessionScreenProps, SessionWorkspaceProps } from "./session-types";
import { useProjectList } from "./use-project-directory";
import { sessionPrivacy } from "./session-privacy-model";
import type { HostSession } from "./wire";
import { sessionIntent } from "@/domain/session-authority";
import { TranscriptScrollPosition } from "./transcript-scroll";

export function SessionScreen({ id, projectId }: SessionScreenProps) {
  const machine = useActiveMachine();
  const copy = useCopy();
  if (!machine) {
    return (
      <Screen>
        <Empty
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
      projectId={projectId}
      machineId={machine.id}
    />
  );
}

function SessionWorkspace({ id, projectId: routeProjectId, machineId }: SessionWorkspaceProps) {
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const scope = useMemo<SessionScope>(() => ({ machineId, sessionId: id }), [machineId, id]);
  const projects = useProjectList();
  const cache = useQueryClient();
  const key = hostKey(machineId, ["session", id]);
  const projectIdentity = useRef<{ projectId: string; session: { id: string } } | undefined>(
    undefined,
  );
  const privacy = sessionPrivacy({
    readable: projects.readable,
    pending: projects.privacyPending,
    projects: projects.data,
    sessionId: id,
    routeProjectId,
    // Retain only the proven mapping after cache eviction. Current directory
    // visibility is still required on every read and command.
    cached: cache.getQueryData<HostSession>(key) ?? projectIdentity.current,
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
  const projectId = privacy.projectId ?? session?.projectId;
  const command = useCommands();
  const [settings, setSettings] = useState(false);
  const [transcriptView, setTranscriptView] = useState<TranscriptView>("messages");
  const blocked = !visible || command.isPending || command.error instanceof UncertainCommand;
  const sendCommand = command.mutateAsync;
  const refetchSnapshot = snapshot.refetch;
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
      void refetchSnapshot();
      return receipt;
    },
    [sendCommand, refetchSnapshot, cache, machineId, id, privacy.projectId, canRead, session],
  );

  const refresh = () => {
    void snapshot.refetch();
  };
  const receiptHandled = () => {
    command.reset();
    refresh();
  };

  return (
    <ComposerTransferProvider scope={scope}>
      <Screen scroll={false}>
        <Stack.Screen
          options={{
            title: visible
              ? session?.session.title || copy("Oturum", "Session")
              : copy("Oturum", "Session"),
            headerRight: visible
              ? () => <TranscriptViewFilter value={transcriptView} onChange={setTranscriptView} />
              : undefined,
          }}
        />
        {!visible ? (
          !projects.directoryReady ? (
            <>
              <QueryState
                query={projects}
                loading="content"
                loadingLabel={copy("Proje doğrulanıyor…", "Verifying project…")}
              />
              {projects.privacyUnavailable ? (
                <Notice
                  message={copy(
                    "Oturumları görmek için bilgisayarda bycoda’yı aç ve proje listesini eşitle.",
                    "Open bycoda on the computer and sync the project directory to see sessions.",
                  )}
                  onRetry={() => {
                    void projects.refetch();
                  }}
                />
              ) : projects.readiness === "waiting" ? (
                <Notice
                  message={copy("Bağlantı bekleniyor", "Waiting for a connection")}
                  action={{
                    label: copy("Bağlantıları yönet", "Manage connections"),
                    onPress: () => router.push("/machines"),
                  }}
                />
              ) : null}
            </>
          ) : privacy.canRead ? (
            <QueryState
              query={snapshot}
              loading="content"
              loadingLabel={copy("Oturum yükleniyor…", "Loading session…")}
            />
          ) : privacy.reason === "hidden" ? (
            <Empty
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
            <Notice
              message={copy(
                "Projesini doğrulamak için bu oturumu oturum listesinden açın.",
                "Open this session from the session list to verify its project.",
              )}
              action={{
                label: copy("Oturumlar", "Sessions"),
                onPress: () => router.push("/sessions"),
              }}
            />
          )
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
              />
            }
            style={{
              flex: 1,
              width: "100%",
              maxWidth: metrics.contentWidth,
              alignSelf: "center",
              paddingLeft: Math.max(insets.left, space.screen),
              paddingRight: Math.max(insets.right, space.screen),
              paddingTop: space.xs,
            }}
          >
            {session ? (
              <SessionToolbar
                scope={scope}
                projectId={projectId}
                query={{ ...snapshot, data: session }}
                command={command}
                blocked={blocked}
                onSettings={() => setSettings(true)}
                onRefresh={refresh}
                onCommand={dispatch}
              />
            ) : null}
            {visible ? <QueryState query={snapshot} /> : null}
            <SessionTranscript
              navigation={navigation.current}
              view={transcriptView}
              scope={scope}
              session={session}
              blocked={blocked}
              command={command}
              onCommand={dispatch}
              onReceiptHandled={receiptHandled}
            />
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
