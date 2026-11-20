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
import { SessionComposerHeightProvider } from "../../src/features/workspace/session-keyboard-frame";
import { useRememberLastSession } from "../../src/features/workspace/last-session";

export default function SessionRoute() {
  const { id, projectId, machineId, targetTurnId } = useLocalSearchParams<{
    id: string;
    projectId?: string;
    machineId?: string;
    targetTurnId?: string;
  }>();
  useRememberLastSession(id, projectId, machineId);
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
      <SessionComposerHeightProvider
        fallback={insets.bottom}
        overlay={(bottomInset) => <TabletQuickPanel bottomInset={bottomInset} />}
      >
        {sessionScreen}
      </SessionComposerHeightProvider>
    </View>
  );
  // One tree for phone, tablet and split: SplitView keeps `session` in the same slot, so crossing a
  // breakpoint (rotation, Split View, fold) only adds or removes the rail and list beside it and
  // never remounts the transcript, composer draft or scroll position.
  return (
    <WorkspaceRouteScope machineId={machineId}>
      {/* The split keeps the list in place, so switching sessions must not slide the whole screen. */}
      {split ? <Stack.Screen options={{ animation: "none" }} /> : null}
      <SplitView
        // Portrait tablets keep the same rail as the tab roots beside the session.
        rail={tablet ? <TabletRail /> : null}
        list={
          split ? (
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
          ) : null
        }
        detail={session}
      />
    </WorkspaceRouteScope>
  );
}
