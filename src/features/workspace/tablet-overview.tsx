import { useSyncExternalStore } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useNetInfo } from "@react-native-community/netinfo";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useSecurity } from "@/state/security";
import { useHostClient, useHostReadActive } from "@/state/queries";
import { Screen } from "@/ui/primitives";
import { Body, Heading } from "@/ui/typography";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { metrics, radii, space } from "@/ui/tokens";
import { connectionPhase } from "@/ui/connection-presentation";
import { remoteErrorKind } from "@/ui/error-message";
import { machineSuccessStore } from "@/ui/machine-success-store";
import { useProjectActivity } from "./use-project-activity";
import { useElapsedNow } from "./use-elapsed-now";
import { useLatestCallback } from "./use-latest-callback";
import { SessionListRow } from "./session-list-row";
import { queryOwnsRegion } from "./query-region";
import { tabletOverviewModel } from "./tablet-overview-model";

/** Wide-tablet Sessions detail pane before a conversation is selected. */
export function TabletOverview() {
  const copy = useCopy();
  const { colors, uiStyles } = useMobileTheme();
  const machine = useActiveMachine();
  const machines = useMachines((state) => state.machines);
  const activity = useProjectActivity();
  const cache = useQueryClient().getQueryCache();
  const client = useHostClient();
  const network = useNetInfo();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const now = useElapsedNow(useHostReadActive());
  const connectedIds = useSyncExternalStore(
    (listener) => cache.subscribe(listener),
    () => machines.filter((saved) => {
      const health = cache.find({ queryKey: ["machine", saved.id, "connection"] });
      return connectionPhase({
        paired: true,
        networkConnected: network.isConnected,
        unlocked,
        permitted: saved.id !== machine?.id || !!client,
        successAt: machineSuccessStore(cache, saved.id).getSnapshot(),
        errorAt: health?.state.errorUpdatedAt ?? 0,
        accessDenied: ["auth", "identity"].includes(remoteErrorKind(health?.state.error) ?? ""),
        now,
      }) === "connected";
    }).map((saved) => saved.id).join(","),
  );
  const model = tabletOverviewModel(activity.directory, machines, new Set(connectedIds.split(",")), now);
  const machineId = machine?.id;
  const canReadProject = useLatestCallback((projectId: string) => activity.projects.isProjectVisible(projectId));
  const openSession = useLatestCallback((id: string, projectId: string) => {
    if (machineId && useMachines.getState().activeId === machineId)
      router.navigate({ pathname: "/session/[id]", params: { id, projectId, machineId } });
  });
  const query = {
    data: activity.directory.length ? activity.directory : undefined,
    isPending: activity.pending,
    error: activity.error,
    isFetching: false,
    refetch: activity.refetch,
  };
  // The list beside this pane already shows loading, waiting, error and empty states with their
  // actions; repeating them here would show the same failure twice and counters of a failed read.
  const listOwnsState = !activity.directory.length || queryOwnsRegion(query);
  if (listOwnsState) return <Screen />;
  const counters = [
    { label: copy("Çalışıyor", "Running"), value: String(model.running) },
    { label: copy("Dikkat", "Attention"), value: String(model.attentionCount), warning: model.attentionCount > 0 },
    { label: copy("Bilgisayar", "Computers"), value: `${model.connected}/${model.total}` },
  ];
  return (
    <Screen refresh={activity.refetch}>
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
            canRead={canReadProject} snoozed={false} onPress={openSession}
          /> : null)}
        </View> : null)}
      </View>
    </Screen>
  );
}
