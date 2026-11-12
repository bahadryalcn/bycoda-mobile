import { useMobileTheme } from "@/ui/theme";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { haptic } from "./motion";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Laptop from "lucide-react-native/icons/laptop";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import WifiOff from "lucide-react-native/icons/wifi-off";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { notifyManager, useQueryClient } from "@tanstack/react-query";
import { useNetInfo } from "@react-native-community/netinfo";
import { useActiveMachine, useMachines } from "../state/machines";
import { useConsentPending, useHostClient, useHostQuery } from "../state/queries";
import { useSecurity } from "../state/security";
import type { HostDescriptor } from "../remote/types";
import { hitSlopFor, metrics, radii, space } from "./tokens";
import { Body, NavigationGroup, NavigationRow, Sheet } from "./primitives";
import { IconTile } from "./icon-tile";
import HardDrive from "lucide-react-native/icons/hard-drive";
import { useCopy } from "./copy";
import { connectionPhase } from "./connection-presentation";
import { Menu } from "panelui-native/components/menu";
import { BusyIndicator as Spinner } from "./busy-indicator";
import { decorativeSvgProps } from "./accessibility";
import { remoteErrorKind } from "./error-message";
import { machineSuccessStore } from "./machine-success-store";
import { refetchRecoveredReads } from "../state/query-retry";

/** Connection state for the active computer; mounting it also keeps the descriptor fresh. */
function useMachineStatus() {
  const { colors, semanticColors } = useMobileTheme();
  const machine = useActiveMachine();
  const copy = useCopy();
  const network = useNetInfo();
  const cache = useQueryClient();
  const client = useHostClient();
  // Until the saved consent is read, a missing client means "still checking", not "permission required".
  const consentPending = useConsentPending();
  const storageError = useMachines((state) => state.storageError);
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const successStore = useMemo(() => machineSuccessStore(cache.getQueryCache(), machine?.id ?? null), [cache, machine?.id]);
  const subscribeSuccess = useCallback(
    (callback: () => void) => successStore.subscribe(notifyManager.batchCalls(callback)),
    [successStore],
  );
  const successAt = useSyncExternalStore(
    subscribeSuccess,
    successStore.getSnapshot,
    successStore.getSnapshot,
  );
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
    permitted: !!client || consentPending,
    storageError,
    accessDenied: ["auth", "identity"].includes(remoteErrorKind(health.error) ?? ""),
    successAt,
    errorAt: health.errorUpdatedAt,
    now: Date.now(),
  });
  const statuses = {
    unpaired: copy("Bilgisayar bağla", "Connect a computer"),
    offline: copy("Ağ bağlantısı yok", "No network connection"),
    locked: copy("Kilitli", "Locked"),
    permission: copy("İzin gerekiyor", "Permission required"),
    access: copy("Erişim gerekli", "Access needed"),
    storage: copy("Yerel depolama hatası", "Local storage error"),
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
          : phase === "permission" || phase === "access" || phase === "locked" || phase === "storage"
            ? semanticColors.warning.text
            : colors.muted;
  return { machine, copy, health, successAt, unlocked, phase, status, statusColor, storageError };
}

/** Headless owner of the periodic connection check while the tab shell is mounted. */
export function MachineHealthMonitor() {
  const { machine, successAt } = useMachineStatus();
  const cache = useQueryClient();
  useEffect(() => {
    if (machine && successAt) refetchRecoveredReads(cache, machine.id, successAt);
  }, [cache, machine?.id, successAt]);
  return null;
}

/** Quiet while healthy; use the existing active-computer health owner for exceptional states. */
export function MachineConnectionStatus() {
  const { uiStyles } = useMobileTheme();
  const { phase, status, statusColor } = useMachineStatus();
  if (phase === "connected") return null;
  const StatusIcon = phase === "offline" || phase === "disconnected" ? WifiOff : CircleAlert;
  return <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minWidth: 0 }}>
    {phase === "checking" ? <Spinner size="sm" color={statusColor} />
      : <StatusIcon {...decorativeSvgProps} size={14} color={statusColor} />}
    <Body style={[uiStyles.caption, { color: statusColor, flexShrink: 1 }]}>{status}</Body>
  </View>;
}

/** Page title with a compact computer pill: one 48dp-tall row, no stacked subtitle. */

export function MachinePill({ heading, subtitle }: { heading?: string; subtitle?: string } = {}) {
  const { colors, uiStyles, pressedFill } = useMobileTheme();
  const { machine, copy, health, successAt, unlocked, phase, status, statusColor, storageError } = useMachineStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [menuMachineId, setMenuMachineId] = useState(machine?.id);
  if (menuMachineId !== machine?.id) {
    setMenuMachineId(machine?.id);
    if (menuOpen) setMenuOpen(false);
  }
  if (!unlocked && menuOpen) setMenuOpen(false);
  const name = machine?.name ?? copy("Bilgisayar bağla", "Connect a computer");
  const degraded = phase !== "unpaired" && phase !== "connected" && phase !== "checking" && unlocked;
  const pill = (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={[heading, name, machine ? status : undefined, subtitle, copy("Bilgisayar seç", "Choose computer")]
              .filter(Boolean)
              .join(". ")}
            accessibilityState={{ expanded: menuOpen && unlocked }}
            aria-expanded={menuOpen && unlocked}
            hitSlop={hitSlopFor(metrics.chipHeight)}
            onPress={() => {
              haptic.select();
              if (process.env.EXPO_OS !== "web") setMenuOpen(unlocked);
            }}
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                gap: space.xs + 2,
                height: metrics.chipHeight,
                paddingStart: space.row,
                paddingEnd: space.sm,
                borderRadius: radii.pill,
                backgroundColor: colors.fill,
                flexShrink: 1,
                minWidth: 64,
              },
              pressed && { backgroundColor: pressedFill },
            ]}
          >
            {machine ? (
              health.isFetching && !successAt ? (
                <Spinner size="sm" color={statusColor} />
              ) : (
                <View accessible={false} style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: statusColor }} />
              )
            ) : (
              <Laptop size={14} strokeWidth={2} color={colors.muted} />
            )}
            <Text numberOfLines={1} style={[uiStyles.caption, { color: colors.text, flexShrink: 1, minWidth: 0 }]}>
              {degraded ? `${name} · ${status}` : name}
            </Text>
            <ChevronDown size={12} strokeWidth={2.6} color={colors.muted} style={{ flexShrink: 0 }} />
          </Pressable>
  );
  return (
    // The title keeps its full width; when title and pill no longer fit (large text), the pill wraps below it.
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.sm, rowGap: space.xs, minWidth: 0, flexShrink: 1, alignSelf: heading ? "stretch" : "flex-start" }}>
      {heading ? <Text accessibilityRole="header" style={[uiStyles.pageTitle, { flexShrink: 0, maxWidth: "100%" }]}>{heading}</Text> : null}
      {process.env.EXPO_OS === "web" ? (
        <Menu open={menuOpen && unlocked} onOpenChange={(next) => setMenuOpen(unlocked && next)}>
          <Menu.Trigger>
            {pill}
          </Menu.Trigger>
        <Menu.Content
          placement="bottom"
          align="start"
          offset={space.xs}
          width={280}
          className="rounded-card bg-popover border-0 p-ui-xs shadow-lg"
        >
          {storageError ? <Menu.Item key="storage-recovery" onPress={() => { closeMenu(); router.push("/machines"); }} className="gap-ui-sm">
            <View style={{ flex: 1, gap: space.xs }}>
              <Body>{storageError}</Body>
              <Body>{copy("Depolamayı kurtar", "Recover saved connections")}</Body>
            </View>
          </Menu.Item> : null}
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
      ) : (
        <>
          {pill}
          <Sheet visible={menuOpen && unlocked} title={copy("Bilgisayar", "Computer")} size="compact" onClose={closeMenu}>
            <NavigationGroup>
              {storageError ? (
                <NavigationRow
                  intent="navigate"
                  tone="warning"
                  icon={<IconTile><HardDrive size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
                  label={copy("Depolamayı kurtar", "Recover saved connections")}
                  detail={storageError}
                  detailLines={0}
                  onPress={() => { closeMenu(); router.push("/machines"); }}
                />
              ) : null}
              <NavigationRow
                intent="navigate"
                icon={<IconTile><Laptop size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
                label={machine?.name ?? copy("Bilgisayar bağla", "Connect a computer")}
                detail={machine ? status : undefined}
                detailSelectable={false}
                accessibilityLabel={[machine?.name, status, copy("Bilgisayar seç", "Choose computer")].filter(Boolean).join(". ")}
                separator={!!(machine && health.error)}
                onPress={() => { closeMenu(); router.push("/machines"); }}
              />
              {machine && health.error ? (
                <NavigationRow
                  intent="command"
                  separator={false}
                  icon={<IconTile><RefreshCw size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
                  label={copy("Bağlantıyı yeniden dene", "Retry connection")}
                  onPress={() => { closeMenu(); void health.refetch(); }}
                />
              ) : null}
            </NavigationGroup>
          </Sheet>
        </>
      )}
    </View>
  );
}
