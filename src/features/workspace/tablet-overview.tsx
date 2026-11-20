import { useSyncExternalStore } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useNetInfo } from "@react-native-community/netinfo";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useSecurity } from "@/state/security";
import { hostRuntimeState, subscribeHostRuntimeStates } from "@/state/host-runtime-state";
import { useHostClient, useHostReadActive } from "@/state/queries";
import { Screen, StateView } from "@/ui/primitives";
import { Body, Heading } from "@/ui/typography";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { metrics, radii, space } from "@/ui/tokens";
import { connectionPhase } from "@/ui/connection-presentation";
import { remoteErrorKind } from "@/ui/error-message";
import { machineSuccessStore } from "@/ui/machine-success-store";
import type { ActiveSession } from "./activity-model";
import { useProjectActivity } from "./use-project-activity";
import { useSnoozeNow } from "./session-clock";
import { useLatestCallback } from "./use-latest-callback";
import { SessionListRow } from "./session-list-row";
import { queryOwnsRegion } from "./query-region";
import { tabletDirectoryIsEmpty, tabletOverviewModel, tabletOverviewWakes } from "./tablet-overview-model";

/** Wide-tablet Sessions detail pane before a conversation is selected. */
export function TabletOverview() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const activity = useProjectActivity();
  const machineId = machine?.id;
  const canReadProject = useLatestCallback((projectId: string) => activity.projects.isProjectVisible(projectId));
  const openSession = useLatestCallback((id: string, projectId: string) => {
    if (machineId && useMachines.getState().activeId === machineId)
      router.navigate({ pathname: "/session/[id]", params: { id, projectId, machineId } });
  });
  const openNewSession = useLatestCallback(() => {
    if (machineId && useMachines.getState().activeId === machineId)
      router.navigate({ pathname: "/sessions", params: { new: "1" } });
  });
  const query = {
    data: activity.directory.length ? activity.directory : undefined,
    isPending: activity.pending,
    error: activity.error,
    isFetching: false,
    refetch: activity.refetch,
  };
  const listOwnsRegion = queryOwnsRegion(query);
  // The list beside this pane already shows loading, waiting, error and empty states with their
  // actions; repeating them here would show the same failure twice and counters of a failed read.
  // Only a ready, genuinely empty directory has no list state to defer to, so it gets its own empty state.
  if (!activity.directory.length) {
    if (!tabletDirectoryIsEmpty({
      ready: activity.directoryReady,
      pending: activity.pending,
      waiting: activity.privacyUnavailable || activity.readiness === "waiting",
      privacyPending: activity.privacyPending,
      listOwnsRegion,
    })) return <Screen />;
    const canCreate = !!machineId && (activity.projects.data?.length ?? 0) > 0;
    return (
      <Screen refresh={activity.refetch}>
        <StateView
          illustration="no-sessions"
          title={copy("Henüz oturum yok.", "No sessions yet.")}
          description={canCreate ? copy("Bir proje seçip ilk oturumunu başlat.", "Pick a project and start your first session.") : undefined}
          action={canCreate ? { label: copy("Yeni oturum", "New session"), onPress: openNewSession } : undefined}
        />
      </Screen>
    );
  }
  if (listOwnsRegion) return <Screen />;
  return (
    <Screen refresh={activity.refetch}>
      <TabletOverviewBoard directory={activity.directory} machineId={machineId} canReadProject={canReadProject} onOpenSession={openSession} />
    </Screen>
  );
}

/**
 * Counters and previews. The only component here that reads the clock: it wakes at snooze ends and
 * connected-window closes, so the parent and its empty/list states never re-render on a timer.
 */
function TabletOverviewBoard({ directory, machineId, canReadProject, onOpenSession }: {
  directory: readonly ActiveSession[];
  machineId: string | undefined;
  canReadProject(projectId: string): boolean;
  onOpenSession(id: string, projectId: string): void;
}) {
  const copy = useCopy();
  const { colors, uiStyles } = useMobileTheme();
  const machines = useMachines((state) => state.machines);
  const cache = useQueryClient().getQueryCache();
  const client = useHostClient();
  const network = useNetInfo();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const successAts = machines.map((saved) => machineSuccessStore(cache, saved.id).getSnapshot());
  const now = useSnoozeNow(useHostReadActive(), tabletOverviewWakes(directory, successAts));
  const connectedIds = useSyncExternalStore(
    (listener) => {
      const stopCache = cache.subscribe(listener);
      const stopRuntime = subscribeHostRuntimeStates(listener);
      return () => {
        stopCache();
        stopRuntime();
      };
    },
    () => machines.filter((saved) => {
      const health = cache.find({ queryKey: ["machine", saved.id, "connection"] });
      return connectionPhase({
        paired: true,
        networkConnected: network.isConnected,
        unlocked,
        permitted: saved.id !== machineId || !!client,
        successAt: machineSuccessStore(cache, saved.id).getSnapshot(),
        errorAt: health?.state.errorUpdatedAt ?? 0,
        accessDenied: ["auth", "identity"].includes(remoteErrorKind(health?.state.error) ?? ""),
        now,
        runtime: hostRuntimeState(saved.id),
      }) === "connected";
    }).map((saved) => saved.id).join(","),
  );
  const model = tabletOverviewModel(directory, machines, new Set(connectedIds.split(",")), now);
  const counters = [
    { label: copy("Çalışıyor", "Running"), value: String(model.running) },
    { label: copy("Dikkat", "Attention"), value: String(model.attentionCount), warning: model.attentionCount > 0 },
    { label: copy("Bilgisayar", "Computers"), value: `${model.connected}/${model.total}` },
  ];
  return (
    <View style={{ width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center", gap: space.xxl, paddingTop: space.lg }}>
      <View style={{ flexDirection: "row", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radii.card }}>
        {counters.map((counter, index) => <View key={counter.label} style={{
          flex: 1, minWidth: 0, padding: space.md, gap: space.xs,
          borderStartWidth: index ? StyleSheet.hairlineWidth : 0, borderColor: colors.border,
        }}>
          <Body muted style={uiStyles.caption}>{counter.label}</Body>
          <Heading style={counter.warning ? { color: colors.warning } : undefined}>{counter.value}</Heading>
        </View>)}
      </View>
      {[
        { title: copy("Dikkat gerekiyor", "Needs attention"), rows: model.attention },
        { title: copy("Son oturumlar", "Recent sessions"), rows: model.recent },
      ].map((section) => section.rows.length ? <View key={section.title} style={{ gap: space.sm }}>
        <Heading>{section.title}</Heading>
        {section.rows.map(({ project, session }) => machineId ? <SessionListRow
          key={session.id} machineId={machineId} projectId={project.id} projectName={project.name}
          projectCwd={project.cwd} projectAppearance={project.appearance} showProject session={session}
          canRead={canReadProject} snoozed={false} onPress={onOpenSession}
        /> : null)}
      </View> : null)}
    </View>
  );
}
