import { router, Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SessionScreen } from "../../src/features/workspace/session-screen";
import { ActiveSessionsScreen } from "../../src/features/workspace/active-sessions-screen";
import { TabletRail } from "../../src/features/workspace/tablet-rail";
import { useMachines } from "../../src/state/machines";
import { WorkspaceRouteScope } from "../../src/features/workspace/route-scope";
import { useAdaptiveLayout } from "../../src/ui/adaptive-layout";
import { ScreenChromeProvider } from "../../src/ui/layout";
import { SplitView } from "../../src/ui/split-view";
import { TabletQuickPanel } from "../../src/features/workspace/tablet-quick-panel";

/** Composer, its padding and an extra growing line; the composer height is owned by SessionScreen and is not exposed to the route. */
// shortcut: fixed clearance, a very tall multi-line draft can reach the panel; expose the measured composer height from SessionKeyboardFrame when that happens.
const COMPOSER_CLEARANCE = 144;

export default function SessionRoute() {
  const { id, projectId, machineId, targetTurnId } = useLocalSearchParams<{
    id: string;
    projectId?: string;
    machineId?: string;
    targetTurnId?: string;
  }>();
  const active = useMachines((s) => s.activeId);
  const { tablet, split } = useAdaptiveLayout();
  const insets = useSafeAreaInsets();
  const sessionScreen = (
    <SessionScreen
      key={`${active}:${id}:${projectId ?? ""}:${targetTurnId ?? ""}`}
      id={id}
      projectId={projectId}
      targetTurnId={targetTurnId}
      layout={split ? "split" : tablet ? "tablet" : "phone"}
    />
  );
  const session = (
    <View style={{ flex: 1 }}>
      {sessionScreen}
      <TabletQuickPanel bottomInset={insets.bottom + COMPOSER_CLEARANCE} />
    </View>
  );
  if (!split)
    return (
      <WorkspaceRouteScope machineId={machineId}>
        {tablet ? (
          // Portrait tablets keep the same rail as the tab roots beside the session.
          <View style={{ flex: 1, flexDirection: "row" }}>
            <TabletRail />
            {session}
          </View>
        ) : (
          session
        )}
      </WorkspaceRouteScope>
    );
  return (
    <WorkspaceRouteScope machineId={machineId}>
      {/* The split keeps the list in place, so switching sessions must not slide the whole screen. */}
      <Stack.Screen options={{ animation: "none" }} />
      <SplitView
        rail={<TabletRail />}
        list={
          // The list column has no native header above it; it draws its own title.
          <ScreenChromeProvider>
            <View style={{ flex: 1, paddingTop: insets.top }}>
              <ActiveSessionsScreen
                overview
                urgency
                selectedSessionId={id}
                onOpenSession={(sessionId, nextProjectId, nextMachineId) =>
                  router.setParams({ id: sessionId, projectId: nextProjectId, machineId: nextMachineId, targetTurnId: undefined })}
              />
            </View>
          </ScreenChromeProvider>
        }
        detail={session}
      />
    </WorkspaceRouteScope>
  );
}
