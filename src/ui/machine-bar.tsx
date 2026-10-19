import { useMobileTheme } from "@/ui/theme";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { haptic, usePressMotion } from "./motion";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Laptop from "lucide-react-native/icons/laptop";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { notifyManager, useQueryClient } from "@tanstack/react-query";
import { useNetInfo } from "@react-native-community/netinfo";
import { useActiveMachine, useMachines } from "../state/machines";
import { useHostClient, useHostQuery } from "../state/queries";
import { useSecurity } from "../state/security";
import type { HostDescriptor } from "../remote/types";
import { colors, radii, semanticColors, space } from "./tokens";
import { uiStyles } from "./styles";
import { Body } from "./primitives";
import { useCopy } from "./copy";
import { connectionPhase } from "./connection-presentation";
import { Menu } from "panelui-native/components/menu";
import { Spinner } from "panelui-native/components/spinner";

/** Connection state for the active computer; mounting it also keeps the descriptor fresh. */
function useMachineStatus() {
  const machine = useActiveMachine();
  const copy = useCopy();
  const network = useNetInfo();
  const cache = useQueryClient();
  const client = useHostClient();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const subscribe = useCallback(
    (callback: () => void) => cache.getQueryCache().subscribe(notifyManager.batchCalls(callback)),
    [cache],
  );
  const lastSuccess = useCallback(
    () =>
      Math.max(
        0,
        ...cache
          .getQueryCache()
          .findAll({ queryKey: ["machine", machine?.id ?? null] })
          .map((query) => query.state.dataUpdatedAt),
      ),
    [cache, machine?.id],
  );
  const successAt = useSyncExternalStore(subscribe, lastSuccess, lastSuccess);
  const health = useHostQuery<HostDescriptor>(
    ["connection"],
    "environment.describe",
    {},
    { interval: 30_000 },
  );
  const refresh = useMachines((s) => s.refreshDescriptor);
  // The descriptor is persisted connection metadata, rather than an editable copy of query data.
  useEffect(() => {
    if (machine && health.isSuccess && health.data) refresh(machine.id, health.data);
  }, [machine?.id, health.isSuccess, health.data, refresh]);
  const phase = connectionPhase({
    paired: !!machine,
    networkConnected: network.isConnected,
    unlocked,
    permitted: !!client,
    successAt,
    errorAt: health.errorUpdatedAt,
    now: Date.now(),
  });
  const statuses = {
    unpaired: copy("Bilgisayar bağla", "Connect a computer"),
    offline: copy("Ağ bağlantısı yok", "No network connection"),
    locked: copy("Kilitli", "Locked"),
    permission: copy("İzin gerekiyor", "Permission required"),
    checking: copy("Bağlantı kontrol ediliyor…", "Checking connection…"),
    connected: copy("Bağlı", "Connected"),
    disconnected: copy("Bağlantı kesildi", "Disconnected"),
  };
  const status = statuses[phase];
  const statusColor =
    phase === "connected"
      ? semanticColors.success.text
      : phase === "checking"
        ? semanticColors.info.text
        : phase === "offline" || phase === "disconnected"
          ? semanticColors.danger.text
          : phase === "permission" || phase === "locked"
            ? semanticColors.warning.text
            : colors.muted;
  return { machine, copy, health, successAt, unlocked, status, statusColor };
}

/** Headless owner of the periodic connection check while the tab shell is mounted. */
export function MachineHealthMonitor() {
  useMachineStatus();
  return null;
}

/** Compact computer switcher shown beside large titles: status dot, name and a menu. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MachinePill() {
  useMobileTheme();
  const { machine, copy, health, successAt, unlocked, status, statusColor } = useMachineStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEffect(closeMenu, [machine?.id, closeMenu]);
  useEffect(() => {
    if (!unlocked) closeMenu();
  }, [unlocked, closeMenu]);
  const press = usePressMotion(0.95);
  const name = machine?.name ?? copy("Bilgisayar bağla", "Connect a computer");
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Menu open={menuOpen && unlocked} onOpenChange={(next) => setMenuOpen(unlocked && next)}>
        <Menu.Trigger>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={[name, machine ? status : undefined, copy("Bilgisayar seç", "Choose computer")]
              .filter(Boolean)
              .join(". ")}
            accessibilityState={{ expanded: menuOpen && unlocked }}
            aria-expanded={menuOpen && unlocked}
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
            onPress={() => haptic.select()}
            hitSlop={6}
            style={[
              {
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                minHeight: 36,
                paddingStart: space.md,
                paddingEnd: space.sm,
                borderRadius: radii.pill,
                backgroundColor: colors.fill,
                maxWidth: 240,
              },
              press.animatedStyle,
            ]}
          >
            {machine ? (
              health.isFetching && !successAt ? (
                <Spinner size="sm" color={statusColor} />
              ) : (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: radii.pill,
                    backgroundColor: statusColor,
                  }}
                />
              )
            ) : (
              <Laptop size={15} strokeWidth={2} color={colors.muted} />
            )}
            <Text numberOfLines={1} style={[uiStyles.caption, { color: colors.text, fontWeight: "600", flexShrink: 1 }]}>
              {name}
            </Text>
            <ChevronDown size={14} strokeWidth={2.6} color={colors.muted} />
          </AnimatedPressable>
        </Menu.Trigger>
        <Menu.Content
          placement="bottom"
          align="start"
          offset={space.xs}
          width={280}
          className="rounded-card bg-popover border-0 p-ui-xs shadow-lg"
        >
          <Menu.Item
            key="computer"
            accessibilityLabel={[machine?.name, status, copy("Bilgisayar seç", "Choose computer")]
              .filter(Boolean)
              .join(". ")}
            onPress={() => {
              closeMenu();
              router.push("/machines");
            }}
            className="gap-ui-sm"
            trailing={<ChevronRight size={16} color={colors.muted} />}
          >
            <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
              <Body style={uiStyles.buttonLabel}>
                {machine?.name ?? copy("Bilgisayar bağla", "Connect a computer")}
              </Body>
              {machine ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  {health.isFetching && !successAt ? (
                    <Spinner size="sm" color={statusColor} />
                  ) : (
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: radii.badge,
                        backgroundColor: statusColor,
                      }}
                    />
                  )}
                  <Text style={[uiStyles.caption, { flex: 1, color: statusColor }]}>{status}</Text>
                </View>
              ) : null}
            </View>
          </Menu.Item>
          {machine && health.error ? (
            <Menu.Item
              key="retry"
              accessibilityLabel={copy("Bağlantıyı yeniden dene", "Retry connection")}
              onPress={() => {
                closeMenu();
                void health.refetch();
              }}
              className="gap-ui-sm"
              icon={<RefreshCw size={17} color={colors.muted} />}
            >
              <Body style={[uiStyles.caption, { flex: 1 }]}>
                {copy("Bağlantıyı yeniden dene", "Retry connection")}
              </Body>
            </Menu.Item>
          ) : null}
        </Menu.Content>
      </Menu>
    </View>
  );
}
