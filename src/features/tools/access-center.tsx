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
  Button,
  IconButton,
  NavigationRow,
  StateView,
  QueryState,
  Row,
  SectionHeader,
  ScreenList,
  SearchField,
} from "@/ui/primitives";
import { IconTile } from "@/ui/icon-tile";
import { useCopy } from "@/ui/copy";
import { useInfoHint } from "@/ui/info-hint";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import {
  readAccessCenter,
  visibleAccessDevices,
  type AccessTarget,
  type HostAccessReport,
  type PairedDevice,
} from "./access-center-model";
import { AccessDevice } from "./access-device";
import { AccessTunnels, type AccessTunnel } from "./access-tunnels";
import { tunnelPresentation } from "./tunnel-presentation";
function NetworkRow({ icon: Icon, label, description, badge, tone }: {
  icon: ComponentType<{ size: number; strokeWidth: number; color: string }>;
  label: string;
  description: string;
  badge: string;
  tone: "success" | "warning" | "default";
}) {
  const { colors } = useMobileTheme();
  const info = useInfoHint(description);
  return (
    <Row style={{ alignItems: "center", gap: space.md }}>
      <IconTile>
        <Icon size={18} strokeWidth={2} color={colors.muted} />
      </IconTile>
      <View style={{ flex: 1, flexShrink: 1, gap: space.xxs }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Body style={{ flexShrink: 1 }}>{label}</Body>
          {info.button}
        </View>
        {info.panel}
      </View>
      <Badge label={badge} tone={tone} />
    </Row>
  );
}

type AccessRow =
  | { kind: "heading"; id: string }
  | { kind: "device"; id: string; device: PairedDevice }
  | { kind: "tunnel"; id: string; tunnel: AccessTunnel };
export function AccessCenter() {
  const copy = useCopy();
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const intro = useInfoHint(copy(
    "Bu bilgisayarı kontrol edebilen eşleşmiş cihazlar ve bu cihazların ulaşabildiği ağlar.",
    "Paired devices can control this computer. Networks show where they can reach it.",
  ));
  const { colors } = useMobileTheme();
  const machine = useActiveMachine();
  const supported = !!machine?.environmentId && machine.capabilities?.includes("host.access.read");
  const [selected, setSelected] = useState<{
    target: AccessTarget;
    reviewed: ReviewedMachine | undefined;
    device?: PairedDevice;
    tunnel?: AccessTunnel;
    create?: boolean;
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
          await client.request("host.access.read", {}, { signal }),
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
        { kind: "heading", id: "tunnels" },
        ...(report.tunnels?.tunnels ?? []).map((tunnel): AccessRow => ({
          kind: "tunnel",
          id: `tunnel:${tunnel.id}`,
          tunnel,
        })),
      ]
    : [];
  const states: Record<HostAccessReport["lan"]["state"], string> = {
    ready: copy("Hazır", "Ready"),
    "setup-required": copy("Kurulum gerekli", "Setup required"),
    "install-required": copy("Kurulum gerekli", "Installation required"),
    "sign-in-required": copy("Oturum açılması gerekli", "Sign-in required"),
    offline: copy("Çevrimdışı", "Offline"),
    "approval-required": copy("Onay gerekiyor", "Approval required"),
    "permission-required": copy("İzin gerekiyor", "Permission required"),
    unavailable: copy("Kullanılamıyor", "Unavailable"),
  };
  const networkTone = (state: HostAccessReport["lan"]["state"]) =>
    state === "ready" ? "success" : state === "offline" ? "default" : "warning";
  const changed =
    selected &&
    (!supported || !isReviewedMachine(selected.reviewed, { activeId: machine?.id ?? null, machines: machine ? [machine] : [] }));
  useEffect(() => { if (changed) setSelected(undefined); }, [changed]);
  return (
    <>
      <ScreenList<AccessRow>
        title={copy("Bilgisayar erişimi", "Host access")}
        subtitle={machine?.name}
        query={supported ? query : undefined}
        refreshState={supported ? refresh : undefined}
        actions={<IconButton label={copy("Yenile", "Refresh")} busy={refresh.refreshing}
          disabled={!supported || query.isFetching} onPress={() => { void refresh.onRefresh(); }}>
          <RefreshCw size={22} strokeWidth={2} color={colors.accent} />
        </IconButton>}
        data={rows}
        keyExtractor={(row) => row.id}
        header={
          <View style={{ gap: space.sm }}>
            <Stack.Screen options={{ title: copy("Bilgisayar erişimi", "Host access") }} />
            {!machine ? (
              <StateView illustration="connect-computer" title={copy("Önce bir bilgisayar bağla", "Connect a computer first")} />
            ) : !supported ? (
              <StateView
                illustration="permission"
                title={copy("Güncelleme gerekiyor", "Update needed")}
                description={copy(
                  "Erişim merkezini açmak için bilgisayardaki bycoda’yı güncelleyin.",
                  "Update bycoda on this computer to open the access center.",
                )}
              />
            ) : (
              <QueryState query={query} />
            )}
            {report ? (
              <View style={{ gap: space.sm }}>
                <SectionHeader title={copy("Ağlar", "Networks")} trailing={intro.button} />
                {intro.panel}
                <NetworkRow icon={Wifi} label={copy("Yerel ağ", "Local network")}
                  description={copy("Aynı Wi-Fi ağındaki telefonlar bu bilgisayara ulaşabilir.", "Phones on the same Wi-Fi can reach this computer.")}
                  badge={states[report.lan.state]} tone={networkTone(report.lan.state)} />
                <NetworkRow icon={Network} label={copy("Özel ağ", "Private network")}
                  description={copy("Evin dışından özel ağ (ör. Tailscale) üzerinden bağlanır.", "Away from home, connects over your private network such as Tailscale.")}
                  badge={states[report.privateNetwork.state]} tone={networkTone(report.privateNetwork.state)} />
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
                  : copy("Dış erişim tünelleri", "External access tunnels")}
                count={item.id === "devices" ? report?.devices.length : undefined}
              />
              {item.id === "devices" && report && (report.devices.length > 6 || search) ? (
                <>
                  <SearchField label={copy("Cihaz ara", "Search devices")} value={search} onChangeText={setSearch} />
                  {!visibleAccessDevices(report.devices, search, locale).length ? <Body muted>{copy("Eşleşen sonuç yok", "No matching results")}</Body> : null}
                </>
              ) : null}
              {item.id === "tunnels" && report?.tunnels ? (
                <>
                  <Body muted>{copy("Genel adres doğrulanmadı.", "Public address reachability is unverified.")}</Body>
                  <Button
                    label={copy("Tünel başlat", "Start tunnel")}
                    disabled={
                      !machine?.capabilities?.includes("tunnels.manage") || query.isFetching
                    }
                    onPress={() => {
                      if (target) setSelected({ target, reviewed: reviewedMachine(machine), create: true });
                    }}
                  />
                </>
              ) : null}
            </View>
          ) : item.kind === "device" ? (
            <NavigationRow
              label={item.device.name}
              icon={<IconTile><Smartphone size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
              supporting={item.device.isCurrent ? <Badge label={copy("Bu telefon", "This phone")} tone="active" /> : undefined}
              detail={`${copy("Eşleştirilmiş cihaz", "Paired device")} · ${item.device.id.slice(-4)}`}
              separator
              onPress={() => {
                if (target) setSelected({ target, reviewed: reviewedMachine(machine), device: item.device });
              }}
            />
          ) : (
            <NavigationRow
              label={`${item.tunnel.provider} · ${item.tunnel.target}`}
              detail={item.tunnel.publicUrl ?? item.tunnel.localUrl}
              detailLines={2}
              supporting={<Row>
                <Badge
                  label={copy(
                    tunnelPresentation(item.tunnel.state).label[0],
                    tunnelPresentation(item.tunnel.state).label[1],
                  )}
                  tone={tunnelPresentation(item.tunnel.state).tone}
                />
              </Row>}
              accessibilityLabel={`${item.tunnel.provider} · ${item.tunnel.target}. ${copy(tunnelPresentation(item.tunnel.state).label[0], tunnelPresentation(item.tunnel.state).label[1])}. ${item.tunnel.publicUrl ?? item.tunnel.localUrl}`}
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
          onClose={() => setSelected(value => value === selected ? undefined : value)}
          onUpdated={() => {
            if (selection.current === selected && isReviewedMachine(selected.reviewed, useMachines.getState())) void query.refetch();
          }}
        />
      ) : null}
      {selected && !changed && !selected.device && report?.tunnels ? (
        <AccessTunnels
          key={`${selected.target.machineId}:${selected.tunnel?.id ?? "new"}`}
          target={selected.target}
          overview={report.tunnels}
          tunnel={selected.tunnel}
          onClose={() => setSelected(value => value === selected ? undefined : value)}
          onUpdated={() => {
            if (selection.current === selected && isReviewedMachine(selected.reviewed, useMachines.getState())) void query.refetch();
          }}
        />
      ) : null}
    </>
  );
}
