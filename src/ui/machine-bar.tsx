import { useMobileTheme } from "@/ui/theme";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { ScopePill } from "./scope-pill";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Laptop from "lucide-react-native/icons/laptop";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import WifiOff from "lucide-react-native/icons/wifi-off";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { notifyManager, useQueryClient } from "@tanstack/react-query";
import { useNetInfo } from "@react-native-community/netinfo";
import { useActiveMachine, useMachines } from "../state/machines";
import { useConsentPending, useHostClient, useHostConsentGranted, useHostQuery } from "../state/queries";
import { selectMobileHostTransport } from "../remote/lan-ws";
import { useSecurity } from "../state/security";
import { ensureDeviceProofBinding } from "../state/proof-binding";
import { proofRefusalOf } from "../remote/device-proof";
import type { HostDescriptor } from "../remote/types";
import { iconSize, radii, space } from "./tokens";
import { Body, Button, NavigationGroup, NavigationRow, RowIcon, Sheet } from "./primitives";
import HardDrive from "lucide-react-native/icons/hard-drive";
import { ConnectionFeedback } from "../features/connections/connection-feedback";
import { selectedComputerFirst } from "../features/connections/saved-computer-order";
import { useSwitchComputer } from "../features/connections/use-switch-computer";
import { storageErrorText } from "../features/connections/storage-error-copy";
import { RetryConnectionRow } from "../features/connections/active-computer-status";
import { useCopy } from "./copy";
import { CONNECTED_WINDOW_MS, connectionPhase, settleConnectionPhase, type ConnectionBlipMemory, type ConnectionPhase } from "./connection-presentation";
import { connectionNeedsPairing, connectionReason } from "./connection-reason";
import { Menu } from "panelui-native/components/menu";
import { BusyIndicator as Spinner } from "./busy-indicator";
import { decorativeSvgProps } from "./accessibility";
import { remoteErrorKind } from "./error-message";
import { machineSuccessStore } from "./machine-success-store";
import { READ_RETRY_GRACE_MS, refetchRecoveredReads } from "../state/query-retry";
import { hostRecoveringSince, recordActiveHostDisconnected, useHostForegroundGeneration, useHostRuntimeStartupFailed, useHostRuntimeState } from "../state/host-runtime-state";

const PROBE_STALL_MS = 5_000;

/** True once a health probe has been in flight longer than PROBE_STALL_MS. */
function useProbeStalled(isFetching: boolean) {
  const [stalled, setStalled] = useState(false);
  // Timer must follow the probe's in-flight state; a re-render is needed when a slow probe crosses the limit.
  useEffect(() => {
    if (!isFetching) return;
    const id = setTimeout(() => setStalled(true), PROBE_STALL_MS);
    return () => {
      clearTimeout(id);
      setStalled(false);
    };
  }, [isFetching]);
  return stalled;
}

/** Forces a render at `at` (epoch ms) so time-windowed state is re-read; null means nothing to wait for. */
function useRerenderAt(at: number | null) {
  const [, setTick] = useState(0);
  // Timer must track the window end; a new success moves it, and cleanup prevents stale ticks.
  useEffect(() => {
    if (at === null) return;
    const id = setTimeout(() => setTick((tick) => tick + 1), Math.max(0, at - Date.now()));
    return () => clearTimeout(id);
  }, [at]);
}

/** Per computer, shared by every status consumer so a pill mounted mid-blip agrees with the rest. */
const blipMemory = new Map<string, ConnectionBlipMemory>();
let blipGeneration: number | null = null;

/** A short blip after a proven connection keeps reading as connected until it outlasts the grace. */
function useSettledConnectionPhase(raw: ConnectionPhase, machineId: string | undefined): ConnectionPhase {
  const generation = useHostForegroundGeneration();
  // A return to the foreground restarts the grace: the socket reconnects before it can be proven.
  if (blipGeneration !== generation) {
    blipGeneration = generation;
    for (const [id, memory] of blipMemory) if (memory.connected) blipMemory.set(id, { connected: true, blipSince: null });
  }
  const settled = machineId
    ? settleConnectionPhase(raw, blipMemory.get(machineId) ?? { connected: false, blipSince: null }, Date.now())
    : null;
  if (machineId && settled) blipMemory.set(machineId, settled.memory);
  useRerenderAt(settled?.holdUntil ?? null);
  return settled?.phase ?? raw;
}

/** Connection state for the active computer; mounting it also keeps the descriptor fresh. */
export function useMachineStatus() {
  const { colors, semanticColors } = useMobileTheme();
  const machine = useActiveMachine();
  const copy = useCopy();
  const network = useNetInfo();
  const cache = useQueryClient();
  const client = useHostClient();
  const consented = useHostConsentGranted(machine);
  const startupFailed = useHostRuntimeStartupFailed();
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
  // The live socket state is the primary signal; the describe poll only covers computers without one.
  const runtime = useHostRuntimeState(machine?.id);
  // A ready socket already proves the link (and pushes changes): the signed describe poll would only
  // cost battery. It still runs once on mount and resumes whenever the socket is not ready.
  const health = useHostQuery<HostDescriptor>(
    ["connection"],
    "environment.describe",
    {},
    { interval: () => (runtime === "ready" ? false : 30_000) },
  );
  const refresh = useMachines((s) => s.refreshDescriptor);
  // The descriptor is persisted connection metadata, rather than an editable copy of query data.
  useEffect(() => {
    if (!machine || !health.isSuccess || !health.data) return;
    refresh(machine.id, health.data);
    // A credential paired before device keys binds itself on the first private connection.
    if (client)
      void ensureDeviceProofBinding(machine, health.data, (method, params, options) =>
        client.request(method, params, options),
      ).catch(() => undefined);
  }, [machine?.id, health.isSuccess, health.data, refresh, client]);
  // A probe still in flight after PROBE_STALL_MS means the link is unproven now, not when the probe finally fails.
  const probeStalled = useProbeStalled(health.isFetching);
  // Recent success only counts for CONNECTED_WINDOW_MS; re-render when that window closes so the pill cannot stay green.
  const now = Date.now();
  const connectedUntil = successAt + CONNECTED_WINDOW_MS;
  useRerenderAt(successAt > 0 && now < connectedUntil ? connectedUntil : null);
  const recoveringSince = hostRecoveringSince(machine?.id);
  const quietUntil = recoveringSince === null ? null : recoveringSince + READ_RETRY_GRACE_MS;
  // A live socket can stay in backoff without another state change; end the quiet window on time.
  useRerenderAt(runtime === "backoff" && quietUntil !== null && now < quietUntil ? quietUntil : null);
  const livePhase = connectionPhase({
    paired: !!machine,
    networkConnected: network.isConnected,
    unlocked,
    permitted: !!client || consentPending || consented,
    startupFailed: !client && consented && startupFailed &&
      selectMobileHostTransport(machine?.capabilities ?? [], true) === "native-wss",
    storageError,
    accessDenied: ["auth", "identity"].includes(remoteErrorKind(health.error) ?? ""),
    successAt,
    errorAt: health.errorUpdatedAt,
    now,
    probeStalled,
    runtime,
    recoveringSince,
  });
  // What the person sees: brief reconnects and timeouts heal quietly behind "connected".
  const phase = useSettledConnectionPhase(livePhase, machine?.id);
  const statuses = {
    unpaired: copy("Bilgisayar bağla", "Connect a computer"),
    offline: copy("Ağ bağlantısı yok", "No network connection"),
    locked: copy("Kilitli", "Locked"),
    permission: copy("İzin gerekiyor", "Permission required"),
    access: copy("Erişim gerekli", "Access needed"),
    storage: copy("Yerel depolama hatası", "Local storage error"),
    "startup-failed": copy("Bağlantı başlatılamadı", "Connection couldn’t start"),
    checking: copy("Bağlantı kontrol ediliyor…", "Checking connection…"),
    connected: copy("Bağlı", "Connected"),
    disconnected: copy("Bağlantı kesildi", "Disconnected"),
  };
  const status = statuses[phase];
  const errorKind = remoteErrorKind(health.error);
  const reason = connectionReason(
    phase,
    errorKind,
    machine?.name ?? "",
    copy,
    proofRefusalOf(health.error),
  );
  const needsPairing = connectionNeedsPairing(phase, errorKind);
  const statusColor =
    phase === "connected"
      ? semanticColors.success.text
      : phase === "checking"
        ? semanticColors.info.text
        : phase === "offline" || phase === "disconnected"
          ? semanticColors.danger.text
          : phase === "permission" || phase === "access" || phase === "locked" || phase === "storage" || phase === "startup-failed"
            ? semanticColors.warning.text
            : colors.muted;
  return { machine, copy, health, successAt, unlocked, phase, livePhase, status, statusColor, storageError, reason, needsPairing };
}

/** Headless owner of the periodic connection check while the tab shell is mounted. */
export function MachineHealthMonitor() {
  const { machine, successAt, phase } = useMachineStatus();
  const cache = useQueryClient();
  const runtime = useHostRuntimeState(machine?.id);
  // Shared loading states read this verdict so they agree with the pill instead of spinning.
  useEffect(() => {
    recordActiveHostDisconnected(phase === "disconnected");
    return () => recordActiveHostDisconnected(false);
  }, [phase]);
  // The socket runtime refreshes its own reads when it reconnects.
  useEffect(() => {
    if (machine && successAt) refetchRecoveredReads(cache, machine.id, successAt, runtime);
  }, [cache, machine?.id, successAt, runtime]);
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

/** `accessory` (the shared project scope) follows the computer selector in the same wrapping row. */
export function MachinePill({ heading, subtitle, accessory, disabled = false }: {
  heading?: string; subtitle?: string; accessory?: ReactNode;
  /** The computer cannot change right now (a new session is being created on it); its status stays readable. */
  disabled?: boolean;
} = {}) {
  const { colors, uiStyles } = useMobileTheme();
  const { machine, copy, health, successAt, unlocked, phase, status, statusColor, storageError, reason, needsPairing } = useMachineStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const [menuMachineId, setMenuMachineId] = useState(machine?.id);
  if (menuMachineId !== machine?.id) {
    setMenuMachineId(machine?.id);
    if (menuOpen) setMenuOpen(false);
  }
  if (!unlocked && menuOpen) setMenuOpen(false);
  const machines = useMachines((state) => state.machines);
  const orderedComputers = selectedComputerFirst(machines, machine?.id);
  const switcher = useSwitchComputer();
  // The active computer only closes the menu; another one is switched in place, and the menu stays open on failure.
  const selectComputer = (id: string) => {
    if (switcher.busy) return;
    if (id === machine?.id) { closeMenu(); return; }
    void switcher.switchTo(id, closeMenu);
  };
  const name = machine?.name ?? copy("Bilgisayar bağla", "Connect a computer");
  const activeConnection = [status, reason].filter(Boolean).join(". ");
  const manageLabel = copy("Bilgisayarları yönet", "Manage computers");
  const manageComputers = () => { closeMenu(); router.navigate("/machines"); };
  const computerChoiceLabel = (saved: (typeof machines)[number], active: boolean) =>
    [saved.name, saved.endpoint, active ? status : undefined,
      active ? copy("Seçili", "Selected") : copy("Bu bilgisayara geç", "Switch to this computer"),
      active ? reason : undefined].filter(Boolean).join(". ");
  const degraded = phase !== "unpaired" && phase !== "connected" && phase !== "checking" && unlocked;
  // "Offline" is reserved for a computer; the phone's own missing network uses the page wording.
  const pillStatus = phase === "startup-failed" ? copy("Hata", "Error") : status;
  const StatusIcon = phase === "offline" || phase === "disconnected" ? WifiOff : CircleAlert;
  // The shared scope pill: the project pill beside it has the same shape, label and chevron.
  const pill = (
          <ScopePill
            accessibilityLabel={[heading, name, machine ? status : undefined, subtitle, copy("Bilgisayar seç", "Choose computer")]
              .filter(Boolean)
              .join(". ")}
            expanded={menuOpen && unlocked}
            disabled={disabled}
            onPress={() => {
              if (process.env.EXPO_OS !== "web" && !disabled) setMenuOpen(unlocked);
            }}
            label={name}
            status={degraded ? (
              // The status may shrink too, so a long status never pushes the computer name out of the pill.
              <Text numberOfLines={1} style={[uiStyles.caption, { color: statusColor, flexShrink: 1, maxWidth: "60%" }]}>
                {pillStatus}
              </Text>
            ) : undefined}
            icon={machine ? (
              // Checking always spins, so connected and checking never differ by dot color alone.
              phase === "checking" || (health.isFetching && !successAt) ? (
                <Spinner size="sm" color={statusColor} />
              ) : degraded ? (
                // A glyph plus the status text, so the state never rests on color alone.
                <StatusIcon {...decorativeSvgProps} size={14} color={statusColor} style={{ flexShrink: 0 }} />
              ) : (
                <View accessible={false} style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: statusColor }} />
              )
            ) : (
              <Laptop size={14} strokeWidth={2} color={colors.muted} />
            )}
          />
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
          {storageError ? <Menu.Item key="storage-recovery" onPress={() => { closeMenu(); router.navigate("/machines"); }} className="gap-ui-sm">
            <View style={{ flex: 1, gap: space.xs }}>
              <Body>{storageErrorText(storageError, copy)}</Body>
              <Body>{copy("Depolamayı kurtar", "Recover saved connections")}</Body>
            </View>
          </Menu.Item> : null}
          <Menu.Item
            key="manage"
            accessibilityLabel={manageLabel}
            onPress={manageComputers}
            className="gap-ui-sm"
            trailing={<ChevronRight size={16} color={colors.muted} />}
          >
            <Body style={uiStyles.caption}>{manageLabel}</Body>
          </Menu.Item>
          {orderedComputers.map((saved) => {
            const active = saved.id === machine?.id;
            return <Menu.Item
              key={saved.id}
              accessibilityLabel={computerChoiceLabel(saved, active)}
              onPress={() => selectComputer(saved.id)}
              className="gap-ui-sm"
            >
              <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                <Body style={uiStyles.buttonLabel}>{saved.name}</Body>
                <Body muted style={uiStyles.caption}>{saved.endpoint}</Body>
                {active ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  {health.isFetching && !successAt ? (
                    <Spinner size="sm" color={statusColor} />
                  ) : (
                    <View style={{ width: 5, height: 5, borderRadius: radii.badge, backgroundColor: statusColor }} />
                  )}
                  <Text style={[uiStyles.caption, { flex: 1, color: statusColor }]}>
                    {activeConnection}
                  </Text>
                </View> : null}
              </View>
            </Menu.Item>;
          })}
          {machine && health.error && !needsPairing && phase !== "startup-failed" ? (
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
          <Sheet
            visible={menuOpen && unlocked}
            title={copy("Bilgisayar", "Computer")}
            size="compact"
            onClose={closeMenu}
            footer={<Button tone="quiet" label={manageLabel} onPress={manageComputers} />}
          >
            <NavigationGroup>
              {storageError ? (
                <NavigationRow
                  intent="navigate"
                  tone="warning"
                  icon={<HardDrive size={iconSize.row} strokeWidth={1.8} color={colors.muted} />}
                  label={copy("Depolamayı kurtar", "Recover saved connections")}
                  detail={storageErrorText(storageError, copy)}
                  detailLines={0}
                  onPress={() => { closeMenu(); router.navigate("/machines"); }}
                />
              ) : null}
              {orderedComputers.map((saved) => {
                const active = saved.id === machine?.id;
                // Same row as the Computers screen: plain row icon, one status line, and the address
                // only when two saved computers share a name.
                const sameName = machines.filter((other) => other.name.trim().toLowerCase() === saved.name.trim().toLowerCase()).length > 1;
                return <NavigationRow
                  key={saved.id}
                  intent="command"
                  selected={active}
                  disabled={switcher.busy}
                  icon={<RowIcon glyph={Laptop} />}
                  label={saved.name}
                  detail={sameName ? saved.endpoint : undefined}
                  metadata={active ? activeConnection : undefined}
                  detailLines={0}
                  metadataLines={0}
                  detailSelectable={false}
                  accessibilityLabel={computerChoiceLabel(saved, active)}
                  onPress={() => selectComputer(saved.id)}
                />;
              })}
              {/* The Computers screen's recovery row: scan again when pairing is needed, otherwise retry. */}
              {machine ? (
                <RetryConnectionRow
                  onPair={() => { closeMenu(); router.navigate({ pathname: "/machines", params: { start: "scan" } }); }}
                  onRetry={closeMenu}
                />
              ) : null}
            </NavigationGroup>
            <ConnectionFeedback operation={switcher.operation} />

          </Sheet>
        </>
      )}
      {accessory}
    </View>
  );
}
