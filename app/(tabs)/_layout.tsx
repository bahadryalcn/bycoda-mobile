import { router, Tabs, usePathname } from "expo-router";
import { View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MachineHealthMonitor, MachinePill } from "../../src/ui/machine-bar";
import { setToastClearance } from "../../src/ui/provider";
import { useCopy } from "../../src/ui/copy";
import { useMachines } from "../../src/state/machines";
import { ScreenChromeProvider, type HeaderIdentityProps } from "../../src/ui/layout";
import { NewSessionSheet } from "../../src/features/workspace/new-session-sheet";
import { DockIcon, type DockIconName } from "../../src/ui/dock-icon";
import { FloatingTabBar, TAB_BADGE_DOT, type FloatingTabBarProps } from "../../src/ui/floating-tab-bar";
import { useMobileTheme } from "../../src/ui/theme";
import {
  TabActivityBridge,
  useInboxUnseenBadge,
  useRunningSessionBadge,
} from "../../src/features/workspace/tab-activity-bridge";
import { useAppPreferences } from "../../src/features/navigation-prefs/app-preferences";
import { dockTabState } from "../../src/features/navigation-prefs/tab-preferences";
import { useAdaptiveLayout } from "../../src/ui/adaptive-layout";
import { TabletRail } from "../../src/features/workspace/tablet-rail";
import { TabletQuickPanel } from "@/features/workspace/tablet-quick-panel";
import { useAssistantWindowReserve } from "@/features/assistant/assistant-window-reserve";
import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";

type IconProps = { color: ColorValue; focused: boolean };
function ComputerPageIdentity({ title, subtitle }: HeaderIdentityProps) {
  return <MachinePill heading={title} subtitle={subtitle} />;
}
const icon = (name: DockIconName) =>
  function TabIcon({ color }: IconProps) {
    return <DockIcon name={name} color={color} />;
  };

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];
/** Roots that show the dock. */
const dockRoots = ["/", "/chats", "/inbox", "/manage", "/settings"];

/**
 * The dock overlays the scene (a sibling of the blur target), so the navigator's in-flow
 * tab bar only publishes its props here; it renders nothing and takes no space.
 */
function DockProxy({
  props,
  latest,
  onState,
}: {
  props: TabBarProps;
  latest: { current: TabBarProps | null };
  onState: (signature: string) => void;
}) {
  latest.current = props;
  // Props and the state object are rebuilt on navigator renders; only a real route change may
  // re-render the layout, otherwise publishing them back up loops.
  const signature = `${props.state.index}:${props.state.routes.map((route) => route.key).join(",")}`;
  useEffect(() => onState(signature), [signature, onState]);
  return null;
}

/** Only this small bar subscribes to the running count and inbox dot, not the navigator. */
function BadgedDock({ ...dockProps }: FloatingTabBarProps) {
  const copy = useCopy();
  const running = useRunningSessionBadge((s) => s.count);
  const inboxUnseen = useInboxUnseenBadge((s) => s.unseen);
  const { preferences } = useAppPreferences();
  // Hidden tabs keep their routes (deep links) but get no dock button.
  const props = { ...dockProps, state: dockTabState(dockProps.state, preferences.tabs) } as FloatingTabBarProps;
  const chats = props.state.routes.find((route) => route.name === "chats");
  const inbox = props.state.routes.find((route) => route.name === "inbox");
  const descriptors = { ...props.descriptors };
  if (chats && running) {
    const descriptor = descriptors[chats.key]!;
    descriptors[chats.key] = {
      ...descriptor,
      options: {
        ...descriptor.options,
        tabBarBadge: running > 99 ? "99+" : running,
        tabBarAccessibilityLabel: copy(
          "Oturumlar, {p0} çalışan oturum",
          "Sessions, {p0} running sessions",
          { p0: running > 99 ? "99+" : running },
        ),
      },
    };
  }
  if (inbox && inboxUnseen) {
    const descriptor = descriptors[inbox.key]!;
    descriptors[inbox.key] = {
      ...descriptor,
      options: {
        ...descriptor.options,
        tabBarBadge: TAB_BADGE_DOT,
        tabBarAccessibilityLabel: copy("Gelen kutusu, yeni öğeler", "Inbox, new items"),
      },
    };
  }
  return <FloatingTabBar {...props} descriptors={descriptors} />;
}

export default function TabsLayout() {
  const { colors } = useMobileTheme();
  const insets = useSafeAreaInsets();
  const copy = useCopy();
  const machineId = useMachines((s) => s.activeId);
  const firstConnection = useMachines(
    (s) => s.hydrated && !s.storageError && s.machines.length === 0,
  );
  const pathname = usePathname();
  const { tablet } = useAdaptiveLayout();
  const isWelcome = pathname === "/" && firstConnection;
  // The dock overlays the scene on the tab roots; content and toasts clear its measured height.
  // Every tablet layout navigates with the rail instead, which takes real layout space.
  const railVisible = tablet && !isWelcome;
  const dockVisible = !railVisible && dockRoots.includes(pathname);
  const latestBar = useRef<TabBarProps | null>(null);
  const [, setBarState] = useState("");
  const barProps = latestBar.current;
  const [dockHeight, setDockHeight] = useState(0);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const bottomInset = dockVisible ? dockHeight : 0;
  // The minimized assistant window rests above the dock; tab content clears both.
  const assistantReserve = useAssistantWindowReserve((state) => state.reserve);
  const renderTabBar = useCallback(
    (props: TabBarProps) => <DockProxy props={props} latest={latestBar} onState={setBarState} />,
    [],
  );
  useEffect(() => {
    // Toasts are pinned above the safe area already, which the measured dock includes.
    setToastClearance(Math.max(0, bottomInset - insets.bottom));
    return () => setToastClearance(0);
  }, [bottomInset, insets.bottom]);
  return (
    <ScreenChromeProvider
      bottomSafeArea={false}
      bottomInset={bottomInset + assistantReserve}
      headerIdentity={!isWelcome && machineId ? ComputerPageIdentity : undefined}
    >
      {machineId ? <MachineHealthMonitor /> : null}
      {machineId ? <TabActivityBridge /> : null}
      <View style={{ flex: 1, paddingTop: railVisible ? 0 : insets.top, flexDirection: railVisible ? "row" : "column", backgroundColor: colors.background }}>
        {railVisible ? <TabletRail /> : null}
        <View style={{ flex: 1, paddingTop: railVisible ? insets.top : 0 }}>
          <Tabs
            key={machineId}
            tabBar={renderTabBar}
            screenOptions={{
              headerShown: false,
              sceneStyle: { backgroundColor: colors.background },
            }}
          >
            <Tabs.Screen
              name="index"
              options={{ title: copy("Projeler", "Projects"), tabBarIcon: icon("projects") }}
            />
            <Tabs.Screen
              name="chats"
              options={{
                title: copy("Oturumlar", "Sessions"),
                tabBarIcon: icon("sessions"),
              }}
            />
            <Tabs.Screen
              name="inbox"
              options={{ title: copy("Gelen kutusu", "Inbox"), tabBarIcon: icon("inbox") }}
            />
            <Tabs.Screen
              name="manage"
              options={{ title: copy("Araçlar", "Tools"), tabBarIcon: icon("tools") }}
            />
            <Tabs.Screen
              name="settings"
              options={{ title: copy("Ayarlar", "Settings"), tabBarIcon: icon("settings") }}
            />
          </Tabs>
        </View>
        {dockVisible && barProps ? (
          <BadgedDock
            {...barProps}
            onInsetChange={setDockHeight}
            quickAction={
              machineId
                ? {
                    label: copy("Yeni oturum", "New session"),
                    optionsLabel: copy("Sesli asistan", "Voice assistant"),
                    onPress: () => setNewSessionOpen(true),
                    // Holding the dock's new-session button is the fastest way into a voice call.
                    onLongPress: () =>
                      router.navigate({ pathname: "/assistant", params: { voice: "1" } }),
                  }
                : undefined
            }
          />
        ) : null}
        {tablet && !isWelcome ? (
          <TabletQuickPanel bottomInset={dockVisible ? dockHeight : insets.bottom} />
        ) : null}
        {machineId ? (
          <NewSessionSheet visible={newSessionOpen} onClose={() => setNewSessionOpen(false)} />
        ) : null}
      </View>
    </ScreenChromeProvider>
  );
}
