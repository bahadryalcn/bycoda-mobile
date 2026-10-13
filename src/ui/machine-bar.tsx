import { router } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Laptop from "lucide-react-native/icons/laptop";
import MessageSquare from "lucide-react-native/icons/message-square";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { FadeOut, ReduceMotion } from "react-native-reanimated";
import { notifyManager, useQueryClient } from "@tanstack/react-query";
import { useNetInfo } from "@react-native-community/netinfo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActiveMachine, useMachines } from "../state/machines";
import { useHostClient, useHostQuery } from "../state/queries";
import { useSecurity } from "../state/security";
import type { HostDescriptor } from "../remote/types";
import { colors, metrics, motion, opacity, radii, semanticColors, space } from "./tokens";
import { uiStyles } from "./styles";
import { IconButton } from "./primitives";
import { useCopy } from "./copy";
import { connectionPhase } from "./connection-presentation";
import { useProjectActivity } from "../features/workspace/use-project-activity";
import { Menu, MenuItem, MenuItemLabel } from "./gluestack/menu";
import { reveal } from "./motion";

const dismissMenu = FadeOut.duration(motion.press).reduceMotion(ReduceMotion.System);

export function MachineBar() {
  const insets = useSafeAreaInsets();
  const machine = useActiveMachine();
  const copy = useCopy();
  const network = useNetInfo();
  const cache = useQueryClient();
  const client = useHostClient();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const activity = useProjectActivity();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEffect(closeMenu, [machine?.id, closeMenu]);
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
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.background,
        paddingStart: Math.max(space.sm, insets.left),
        paddingEnd: Math.max(space.sm, insets.right),
        alignItems: "center",
        gap: space.sm,
      }}
    >
      <Menu
        isOpen={menuOpen}
        onOpen={() => setMenuOpen(true)}
        onClose={closeMenu}
        placement="bottom left"
        offset={space.xs}
        entering={reveal}
        exiting={dismissMenu}
        className="rounded-card bg-panel border-separator p-ui-xs"
        style={{ width: 280, maxWidth: "100%" }}
        trigger={(triggerProps) => (
          <Pressable
            {...triggerProps}
            accessibilityRole="button"
            accessibilityLabel={copy("Bilgisayar seç", "Choose computer")}
            accessibilityState={{ expanded: menuOpen }}
            style={({ pressed }) => ({
              width: metrics.touchTarget,
              height: metrics.touchTarget,
              borderRadius: radii.control,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: menuOpen ? colors.selected : "transparent",
              opacity: pressed ? opacity.pressed : 1,
            })}
          >
            <Laptop size={21} strokeWidth={1.6} color={menuOpen ? colors.accent : colors.muted} />
          </Pressable>
        )}
      >
        <MenuItem
          key="computer"
          textValue={[machine?.name, status, copy("Bilgisayar seç", "Choose computer")]
            .filter(Boolean)
            .join(". ")}
          onPress={() => {
            closeMenu();
            router.push("/machines");
          }}
          className="gap-ui-sm"
        >
          <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
            <MenuItemLabel style={uiStyles.buttonLabel}>
              {machine?.name ?? copy("Bilgisayar bağla", "Connect a computer")}
            </MenuItemLabel>
            {machine ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                {health.isFetching && !successAt ? (
                  <ActivityIndicator size="small" color={statusColor} />
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
          <ChevronRight size={16} color={colors.muted} />
        </MenuItem>
        {machine && health.error ? (
          <MenuItem
            key="retry"
            textValue={copy("Bağlantıyı yeniden dene", "Retry connection")}
            onPress={() => {
              closeMenu();
              void health.refetch();
            }}
            className="gap-ui-sm"
          >
            <RefreshCw size={17} color={colors.muted} />
            <MenuItemLabel style={[uiStyles.caption, { flex: 1 }]}>
              {copy("Bağlantıyı yeniden dene", "Retry connection")}
            </MenuItemLabel>
          </MenuItem>
        ) : null}
      </Menu>
      <View style={{ flex: 1 }} />
      {machine ? (
        <IconButton
          label={
            activity.complete
              ? copy("Aktif oturumlar: {p0}", "Active sessions: {p0}", {
                  p0: activity.sessions.length,
                })
              : copy("Aktif oturumlar", "Active sessions")
          }
          onPress={() => router.push("/sessions")}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <MessageSquare
              size={17}
              color={activity.sessions.length ? colors.live : colors.muted}
            />
            <Text
              style={[
                uiStyles.buttonLabel,
                {
                  color: activity.sessions.length ? colors.live : colors.muted,
                  fontVariant: ["tabular-nums"],
                },
              ]}
            >
              {activity.complete
                ? activity.sessions.length > 99
                  ? "99+"
                  : activity.sessions.length
                : "…"}
            </Text>
          </View>
        </IconButton>
      ) : null}
    </View>
  );
}
