import { router, Tabs, usePathname } from "expo-router";
import Folder from "lucide-react-native/icons/folder";
import Inbox from "lucide-react-native/icons/inbox";
import LayoutGrid from "lucide-react-native/icons/layout-grid";
import Settings from "lucide-react-native/icons/settings";
import MessagesSquare from "lucide-react-native/icons/messages-square";
import { View, type ColorValue } from "react-native";
import { BlurTargetView } from "panelui-native/primitives/scrim";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MachineHealthMonitor, MachinePill } from "../../src/ui/machine-bar";
import { setToastClearance } from "../../src/ui/provider";
import { useCopy } from "../../src/ui/copy";
import { useMachines } from "../../src/state/machines";
import { ScreenChromeProvider, type HeaderIdentityProps } from "../../src/ui/layout";
import { NewSessionSheet } from "../../src/features/workspace/new-session-sheet";
import { FloatingTabBar, type DockAction, type BlurTargetRef } from "../../src/ui/floating-tab-bar";
import { useMobileTheme } from "../../src/ui/theme";
import { TabActivityBridge, useRunningSessionBadge } from "../../src/features/workspace/tab-activity-bridge";
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ComponentType, type ComponentRef } from "react";

type IconProps = { color: ColorValue; focused: boolean };
function ComputerPageIdentity({ title, subtitle }: HeaderIdentityProps) {
  return <MachinePill heading={title} subtitle={subtitle} />;
}
const icon = (Glyph: ComponentType<{ color: string; size: number; strokeWidth: number }>) =>
  function TabIcon({ color, focused }: IconProps) {
    return <Glyph color={String(color)} size={22} strokeWidth={focused ? 2.1 : 1.8} />;
  };

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];
/** Roots that show the dock. */
const dockRoots = ["/", "/chats", "/inbox", "/manage", "/settings"];

/**
 * The dock overlays the scene (a sibling of the blur target), so the navigator's in-flow
 * tab bar only publishes its props here; it renders nothing and takes no space.
 */
function DockProxy({ props, latest, onState }: {
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

/** Only this small bar subscribes to the running count, not the navigator. */
function BadgedDock({
  action,
  ...props
}: TabBarProps & { action?: DockAction; blurTarget: BlurTargetRef; onInsetChange: (height: number) => void }) {
  const running = useRunningSessionBadge((s) => s.count);
  const chats = props.state.routes.find((route) => route.name === "chats");
  if (!chats || !running) return <FloatingTabBar {...props} action={action} />;
  const descriptor = props.descriptors[chats.key]!;
  const descriptors = {
    ...props.descriptors,
    [chats.key]: {
      ...descriptor,
      options: { ...descriptor.options, tabBarBadge: running > 99 ? "99+" : running },
    },
  };
  return <FloatingTabBar {...props} descriptors={descriptors} action={action} />;
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
  const isWelcome = pathname === "/" && firstConnection;
  // The dock overlays the scene on the tab roots; content and toasts clear its measured height.
  const dockVisible = dockRoots.includes(pathname);
  // The action keeps its place in the middle of the bar on every root, so the bar never changes shape.
  const actionVisible = !!machineId && dockVisible;
  const latestBar = useRef<TabBarProps | null>(null);
  const [, setBarState] = useState("");
  const barProps = latestBar.current;
  const [dockHeight, setDockHeight] = useState(0);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const blurTarget = useRef<ComponentRef<typeof View>>(null);
  const bottomInset = dockVisible ? dockHeight : 0;
  const renderTabBar = useCallback(
    (props: TabBarProps) => <DockProxy props={props} latest={latestBar} onState={setBarState} />,
    [],
  );
  const action: DockAction | undefined = actionVisible
    ? { label: copy("Yeni oturum", "New session"), onPress: () => setNewSessionOpen(true),
        onLongPress: () => router.push("/assistant"), longPressLabel: copy("Asistan", "Assistant") }
    : undefined;
  useEffect(() => {
    // Toasts are pinned above the safe area already, which the measured dock includes.
    setToastClearance(Math.max(0, bottomInset - insets.bottom));
    return () => setToastClearance(0);
  }, [bottomInset, insets.bottom]);
  const Scene = BlurTargetView ?? View;
  return (
    <ScreenChromeProvider
      bottomSafeArea={false}
      bottomInset={bottomInset}
      headerIdentity={!isWelcome && machineId ? ComputerPageIdentity : undefined}
    >
      {machineId ? <MachineHealthMonitor /> : null}
      {machineId ? <TabActivityBridge /> : null}
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
        <Scene ref={blurTarget as never} style={{ flex: 1 }}>
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
            options={{ title: copy("Projeler", "Projects"), tabBarIcon: icon(Folder) }}
          />
          <Tabs.Screen
            name="chats"
            options={{
              title: copy("Oturumlar", "Sessions"),
              tabBarIcon: icon(MessagesSquare),
            }}
          />
          <Tabs.Screen
            name="inbox"
            options={{ title: copy("Gelen kutusu", "Inbox"), tabBarIcon: icon(Inbox) }}
          />
          <Tabs.Screen
            name="manage"
            options={{ title: copy("Araçlar", "Tools"), tabBarIcon: icon(LayoutGrid) }}
          />
          <Tabs.Screen
            name="settings"
            options={{ title: copy("Ayarlar", "Settings"), tabBarIcon: icon(Settings) }}
          />
        </Tabs>
        </Scene>
        {dockVisible && barProps ? (
          <BadgedDock
            {...barProps}
            action={action}
            blurTarget={blurTarget}
            onInsetChange={setDockHeight}
          />
        ) : null}
        {machineId ? (
          <NewSessionSheet visible={newSessionOpen} onClose={() => setNewSessionOpen(false)} />
        ) : null}
      </View>
    </ScreenChromeProvider>
  );
}
