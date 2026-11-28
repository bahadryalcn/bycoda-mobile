import { Tabs, usePathname } from "expo-router";
import { View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MachineHealthMonitor, MachinePill, ScopeContextRow } from "../../src/ui/machine-bar";
import { PreferenceSaveToast } from "../../src/features/connections/preference-save-toast";
import { setToastClearance } from "../../src/ui/provider";
import { useCopy } from "../../src/ui/copy";
import { useMachines } from "../../src/state/machines";
import { ScreenChromeProvider, type HeaderIdentityProps } from "../../src/ui/layout";
import { openNewChat } from "../../src/features/workspace/new-chat-navigation";
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
import { AssistantEntryButton } from "@/features/assistant/assistant-entry-button";
import { useEffect, useState, type ComponentProps } from "react";

type IconProps = { color: ColorValue; focused: boolean };
/**
 * The tab's context row under its title: the computer pill, then the page's project pill. Called
 * as a plain function by `ScreenHeading`, so it stays hook-free and returns null for an empty row.
 */
function ComputerPageIdentity({ scopeControl, showComputer }: HeaderIdentityProps) {
  if (showComputer) return <MachinePill accessory={scopeControl} />;
  return scopeControl ? <ScopeContextRow>{scopeControl}</ScopeContextRow> : null;
}
const icon = (name: DockIconName) =>
  function TabIcon({ color }: IconProps) {
    return <DockIcon name={name} color={color} />;
  };

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];
/** Roots that show the dock. */
const dockRoots = ["/", "/chats", "/inbox", "/manage", "/settings"];

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
        tabBarAccessibilityLabel: running === 1
          ? copy("Oturumlar, 1 çalışan oturum", "Sessions, 1 running session")
          : copy(
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
  // The dock takes layout space below the tab scene. Only overlaid feedback needs its height.
  // Every tablet layout navigates with the rail instead, which takes real layout space.
  const railVisible = tablet && !isWelcome;
  const dockVisible = !railVisible && dockRoots.includes(pathname);
  const [dockHeight, setDockHeight] = useState(0);
  const bottomInset = dockVisible ? dockHeight : 0;
  // The minimized assistant window rests above the dock and overlays the tab scene.
  const assistantReserve = useAssistantWindowReserve((state) => state.reserve);
  useEffect(() => {
    // Toasts are pinned above the safe area already, which the measured dock includes.
    setToastClearance(Math.max(0, bottomInset - insets.bottom));
    return () => setToastClearance(0);
  }, [bottomInset, insets.bottom]);
  return (
    <ScreenChromeProvider
      bottomSafeArea={!dockVisible}
      bottomInset={assistantReserve}
      headerIdentity={!isWelcome && machineId ? ComputerPageIdentity : undefined}
      // The voice assistant sits at the far right of each tab's title row.
      headerTrailing={!isWelcome && machineId ? <AssistantEntryButton /> : undefined}
    >
      {machineId ? <MachineHealthMonitor /> : null}
      <PreferenceSaveToast />
      {machineId ? <TabActivityBridge /> : null}
      <View style={{ flex: 1, paddingTop: railVisible ? 0 : insets.top, flexDirection: railVisible ? "row" : "column", backgroundColor: colors.background }}>
        {railVisible ? <TabletRail /> : null}
        <View style={{ flex: 1, paddingTop: railVisible ? insets.top : 0 }}>
          <Tabs
            key={machineId}
            tabBar={(props: TabBarProps) => dockVisible ? (
              <BadgedDock
                {...props}
                onInsetChange={setDockHeight}
                quickAction={machineId ? {
                  label: copy("Yeni oturum", "New session"),
                  onPress: () => openNewChat(),
                } : undefined}
              />
            ) : null}
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
        {tablet && !isWelcome ? (
          <TabletQuickPanel bottomInset={dockVisible ? dockHeight : insets.bottom} />
        ) : null}
      </View>
    </ScreenChromeProvider>
  );
}
