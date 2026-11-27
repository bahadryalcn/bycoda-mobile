import { useEffect, useRef, useState, type ComponentType } from "react";
import { Stack } from "expo-router";
import { useLocale } from "@/i18n";
import { View } from "react-native";
import Network from "lucide-react-native/icons/network";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Smartphone from "lucide-react-native/icons/smartphone";
import Wifi from "lucide-react-native/icons/wifi";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { usePullRefresh } from "@/ui/use-pull-refresh";
import { useHostQuery } from "@/state/queries";
import {
  Badge,
  Body,
  IconButton,
  NavigationRow,
  NoResults,
  StateView,
  NavigationGroup,
  QueryState,
  RowIcon,
  SectionHeader,
  Screen,
  ScreenList,
  SearchField,
  StatusText,
  ValueRow,
  useCollapsibleSearch,
} from "@/ui/primitives";
import { NoComputerGate } from "@/ui/no-computer";
import { useCopy } from "@/ui/copy";
import { useInfoHint } from "@/ui/info-hint";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, space } from "@/ui/tokens";
import {
  activeAccessTunnels,
  readAccessCenter,
  visibleAccessDevices,
  type AccessTarget,
  type HostAccessReport,
  type PairedDevice,
} from "./access-center-model";
import { AccessDevice } from "./access-device";
import { AccessTunnels, type AccessTunnel } from "./access-tunnels";
import { tunnelPresentation } from "./tunnel-presentation";
function NetworkRow({ icon, label, status, tone }: {
  icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  label: string;
  status: string;
  tone: "default" | "warning";
}) {
  // Ready and optional setup read as quiet text; only a network that needs the user is tinted.
  return (
    <ValueRow icon={<RowIcon glyph={icon} />} label={label}
      value={tone === "default" ? status : undefined}
      trailing={tone === "default" ? undefined : <StatusText label={status} tone={tone} />} />
  );
}

/** A running tunnel reads as live status (it exposes the Host); only a failed or interrupted one is a tinted badge. */
function TunnelStatus({ state }: { state: AccessTunnel["state"] }) {
  const copy = useCopy();
  const { label, tone } = tunnelPresentation(state);
  return tone === "danger" || tone === "warning"
    ? <Badge label={copy(label[0], label[1])} tone={tone} />
    : <StatusText label={copy(label[0], label[1])} tone={tone === "success" ? "live" : tone} />;
}

type AccessRow =
  | { kind: "heading"; id: string }
  | { kind: "device"; id: string; device: PairedDevice }
  | { kind: "tunnel"; id: string; tunnel: AccessTunnel }
  | { kind: "tunnel-note"; id: string };
export function AccessCenter() {
  const copy = useCopy();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  // The one search convention: an icon in the page actions opening the search sheet.
  const deviceSearch = useCollapsibleSearch(<SearchField label={copy("Cihaz ara", "Search devices")} value={search} onChangeText={setSearch} />);
  const intro = useInfoHint(copy(
    "Eşleştirilmiş cihazlar bu bilgisayara yerel ağdan (aynı Wi-Fi) ya da evin dışından özel ağ (ör. Tailscale) üzerinden ulaşır.",
    "Paired devices reach this computer on the local network (same Wi-Fi) or, away from home, over a private network such as Tailscale.",
  ));
  const { colors } = useMobileTheme();
  const machine = useActiveMachine();
  const supported = !!machine?.environmentId && machine.capabilities?.includes("host.access.read");
  const scopedAccess = machine?.capabilities?.includes("devices.setManagement") === true;
  const [selected, setSelected] = useState<{
    target: AccessTarget;
    reviewed: ReviewedMachine | undefined;
    device?: PairedDevice;
    tunnel?: AccessTunnel;
  }>();
  const selection = useRef(selected); selection.current = selected;
  const query = useHostQuery<HostAccessReport>(
    ["host-access"],
    "host.access.read",
    {},
    {
      enabled: !!supported,
      queryFn: async (client, signal) =>
        readAccessCenter(
          await client.request("host.access.read", scopedAccess ? { includeDevicePermissions: true } : {}, { signal }),
          machine!.environmentId!,
        ),
    },
  );
  const report = supported ? query.data : undefined;
  const refresh = usePullRefresh(supported ? () => query.refetch() : undefined);
  const target = machine?.environmentId
    ? { machineId: machine.id, environmentId: machine.environmentId }
    : undefined;
  const rows: AccessRow[] = report
    ? [
        { kind: "heading", id: "devices" },
        ...visibleAccessDevices(report.devices, search, locale)
          .map((device): AccessRow => ({
          kind: "device",
          id: `device:${device.id}`,
          device,
        })),
        ...(report.tunnels
          ? [
              { kind: "heading", id: "tunnels" } as AccessRow,
              ...activeAccessTunnels(report.tunnels.tunnels).map((tunnel): AccessRow => ({
                kind: "tunnel",
                id: `tunnel:${tunnel.id}`,
                tunnel,
              })),
              ...(activeAccessTunnels(report.tunnels.tunnels).length ? [{ kind: "tunnel-note", id: "tunnel-note" } as AccessRow] : []),
            ]
          : []),
      ]
    : [];
  const states: Record<HostAccessReport["lan"]["state"], string> = {
    ready: copy("Hazır", "Ready"),
    "setup-required": copy("Kurulum gerekli", "Setup required"),
    unavailable: copy("Kullanılamıyor", "Unavailable"),
  };
  // Optional setup is not a problem; only states that block a configured network need attention.
  const networkTone = (state: HostAccessReport["lan"]["state"]) =>
    ["ready", "setup-required"].includes(state) ? "default" as const : "warning" as const;
  const startHint = copy(
    "Tünelleri bilgisayardaki bycoda’dan yönetin.",
    "Manage tunnels in bycoda on the computer.",
  );
  const deviceKind = (device: PairedDevice) => device.isCurrent ? copy("Bu telefon", "This phone")
    : device.isLocalDesktop ? copy("Bu bilgisayar", "This computer") : copy("Eşleştirilmiş cihaz", "Paired device");
  const targetLabel = (tunnel: AccessTunnel) => tunnel.target === "host"
    ? copy("Bilgisayar erişimi", "Computer access") : copy("Geliştirme sunucusu", "Dev server");
  const providerLabel = (tunnel: AccessTunnel) => tunnel.provider === "cloudflare" ? "Cloudflare" : "ngrok";
  const changed =
    selected &&
    (!supported || !isReviewedMachine(selected.reviewed, { activeId: machine?.id ?? null, machines: machine ? [machine] : [] }));
  const selectedTunnel = selected && !changed && selected.tunnel
    ? report?.tunnels?.tunnels.find((tunnel) => tunnel.id === selected.tunnel?.id)
    : undefined;
  useEffect(() => { if (changed) setSelected(undefined); }, [changed]);
  if (!machine) return (
    <Screen title={copy("Bilgisayar erişimi", "Computer access")} scroll={false}>
      <NoComputerGate />
    </Screen>
  );
  return (
    <>
      <ScreenList<AccessRow>
        title={copy("Bilgisayar erişimi", "Computer access")}
        computerSwitch
        scope={{ computer: machine?.name }}
        query={supported ? query : undefined}
        refreshState={supported ? refresh : undefined}
        actions={<>
          {/* Search earns its icon on a long device list; an active query keeps it. */}
          {report && (report.devices.length > 6 || search) ? deviceSearch.trigger : null}
          <IconButton label={copy("Yenile", "Refresh")} busy={refresh.refreshing}
            disabled={!supported || query.isFetching} onPress={() => { void refresh.onRefresh(); }}>
            <RefreshCw size={iconSize.action} strokeWidth={2} color={colors.accent} />
          </IconButton>
        </>}
        data={rows}
        keyExtractor={(row) => row.id}
        header={
          <View style={{ gap: space.sm }}>
            <Stack.Screen options={{ title: copy("Bilgisayar erişimi", "Computer access") }} />
            {deviceSearch.field}
            {!supported ? (
              <StateView
                illustration="permission"
                title={copy("Güncelleme gerekiyor", "Update needed")}
                description={copy(
                  "Erişim merkezini açmak için bilgisayardaki bycoda’yı güncelleyin.",
                  "Update bycoda on this computer to open the access center.",
                )}
              />
            ) : (
              <QueryState size="region" query={query} />
            )}
            {report ? (
              <View style={{ gap: space.sm }}>
                <SectionHeader title={copy("Ağlar", "Networks")} trailing={intro.button} />
                {intro.panel}
                <NavigationGroup>
                <NetworkRow icon={Wifi} label={copy("Yerel ağ", "Local network")}
                  status={states[report.lan.state]} tone={networkTone(report.lan.state)} />
                <NetworkRow icon={Network} label={copy("Özel ağ", "Private network")}
                  status={states[report.privateNetwork.state]} tone={networkTone(report.privateNetwork.state)} />
                </NavigationGroup>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "heading" ? (
            <View style={{ gap: space.sm }}>
              <SectionHeader
                title={item.id === "devices"
                  ? copy("Eşleştirilmiş cihazlar", "Paired devices")
                  : copy("Dış erişim", "External access")}
                count={item.id === "devices" ? report?.devices.length : undefined}
              />
              {item.id === "devices" && report && search.trim() && !visibleAccessDevices(report.devices, search, locale).length
                ? <NoResults compact searching onClearSearch={() => setSearch("")} /> : null}
              {item.id === "tunnels" && report?.tunnels && !activeAccessTunnels(report.tunnels.tunnels).length ? (
                <StateView size="compact" title={copy("Dış erişim kapalı", "External access is off")} description={startHint} />
              ) : null}
            </View>
          ) : item.kind === "tunnel-note" ? (
            <Body muted>{startHint}</Body>
          ) : item.kind === "device" ? (
            <NavigationRow
              label={item.device.name}
              icon={<RowIcon glyph={Smartphone} />}
              detail={deviceKind(item.device)}
              separator
              onPress={() => {
                if (target) setSelected({ target, reviewed: reviewedMachine(machine), device: item.device });
              }}
            />
          ) : (
            <NavigationRow
              label={`${providerLabel(item.tunnel)} · ${targetLabel(item.tunnel)}`}
              detail={item.tunnel.publicUrl ?? item.tunnel.localUrl}
              detailLines={2}
              metadata={item.tunnel.publicUrl ? copy("Genel adres doğrulanmadı.", "Public address reachability is unverified.") : undefined}
              supporting={<TunnelStatus state={item.tunnel.state} />}
              separator
              accessibilityLabel={`${providerLabel(item.tunnel)} · ${targetLabel(item.tunnel)}. ${copy(tunnelPresentation(item.tunnel.state).label[0], tunnelPresentation(item.tunnel.state).label[1])}. ${item.tunnel.publicUrl ?? item.tunnel.localUrl}`}
              onPress={() => {
                if (target) setSelected({ target, reviewed: reviewedMachine(machine), tunnel: item.tunnel });
              }}
            />
          )
        }
      />
      {selected && !changed && selected.device ? (
        <AccessDevice
          key={`${selected.target.machineId}:${selected.device.id}`}
          target={selected.target}
          device={selected.device}
          canManageOtherDevices={!scopedAccess || report?.devices.some((row) => row.isCurrent && row.canManageDevices) === true}
          onClose={() => setSelected(value => value === selected ? undefined : value)}
          onUpdated={() => {
            if (selection.current === selected && isReviewedMachine(selected.reviewed, useMachines.getState())) void query.refetch();
          }}
        />
      ) : null}
      {selectedTunnel ? (
        <AccessTunnels
          computer={machine?.name}
          tunnel={selectedTunnel}
          onClose={() => setSelected(value => value === selected ? undefined : value)}
        />
      ) : null}
    </>
  );
}
