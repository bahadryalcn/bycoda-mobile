import { useState } from "react";
import { View } from "react-native";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import {
  Badge,
  Body,
  Button,
  NavigationRow,
  Notice,
  QueryState,
  Row,
  ScreenList,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import {
  readAccessCenter,
  type AccessTarget,
  type HostAccessReport,
  type PairedDevice,
} from "./access-center-model";
import { AccessDevice } from "./access-device";
import { AccessTunnels, type AccessTunnel } from "./access-tunnels";
import { tunnelPresentation } from "./tunnel-presentation";
type AccessRow =
  | { kind: "heading"; id: string }
  | { kind: "device"; id: string; device: PairedDevice }
  | { kind: "tunnel"; id: string; tunnel: AccessTunnel };
export function AccessCenter() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const supported = !!machine?.environmentId && machine.capabilities?.includes("host.access.read");
  const [selected, setSelected] = useState<{
    target: AccessTarget;
    device?: PairedDevice;
    tunnel?: AccessTunnel;
    create?: boolean;
  }>();
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
  const target = machine?.environmentId
    ? { machineId: machine.id, environmentId: machine.environmentId }
    : undefined;
  const rows: AccessRow[] = report
    ? [
        { kind: "heading", id: "devices" },
        ...report.devices.map((device): AccessRow => ({
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
    "approval-required": copy("Onay gerekli", "Approval required"),
    "permission-required": copy("İzin gerekli", "Permission required"),
    unavailable: copy("Kullanılamıyor", "Unavailable"),
  };
  const changed =
    selected &&
    (selected.target.machineId !== machine?.id ||
      selected.target.environmentId !== machine?.environmentId);
  return (
    <>
      <ScreenList<AccessRow>
        title={copy("Bilgisayar erişimi", "Host access")}
        subtitle={machine?.name}
        data={rows}
        keyExtractor={(row) => row.id}
        header={
          <View style={{ gap: space.sm }}>
            {!machine ? (
              <Notice message={copy("Önce bir bilgisayar bağla", "Connect a computer first")} />
            ) : !supported ? (
              <Notice
                message={copy(
                  "Erişim merkezini açmak için bilgisayardaki bycoda’yı güncelleyin.",
                  "Update bycoda on this computer to open the access center.",
                )}
              />
            ) : (
              <QueryState query={query} />
            )}
            {report ? (
              <>
                <Row><Body style={{ flex: 1 }}>{copy("Yerel ağ", "Local network")}</Body><Badge label={states[report.lan.state]} /></Row>
                <Row><Body style={{ flex: 1 }}>{copy("Özel ağ", "Private network")}</Body><Badge label={states[report.privateNetwork.state]} /></Row>
                {report.devicesTruncated ? (
                  <Notice
                    message={copy(
                      "En fazla 256 eşleştirilmiş cihaz gösteriliyor.",
                      "Showing up to 256 paired devices.",
                    )}
                  />
                ) : null}
                {report.tunnels === null ? (
                  <Notice
                    message={copy("Tünel durumu kullanılamıyor.", "Tunnel status is unavailable.")}
                  />
                ) : null}
              </>
            ) : null}
            <Button busy={query.isFetching}
              tone="quiet"
              label={copy("Yenile", "Refresh")}
              disabled={!supported || query.isFetching}
              onPress={() => {
                void query.refetch();
              }}
            />
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "heading" ? (
            <View style={{ gap: space.sm }}>
              <Body>
                {item.id === "devices"
                  ? copy("Eşleştirilmiş cihazlar", "Paired devices")
                  : copy("Dış erişim tünelleri", "External access tunnels")}
              </Body>
              {item.id === "tunnels" && report?.tunnels ? (
                <>
                  <Body muted>
                    {copy(
                      "Genel adresin erişilebilirliği doğrulanmadı.",
                      "Public address reachability is unverified.",
                    )}
                  </Body>
                  <Button
                    label={copy("Tünel başlat", "Start tunnel")}
                    disabled={
                      !machine?.capabilities?.includes("tunnels.manage") || query.isFetching
                    }
                    onPress={() => {
                      if (target) setSelected({ target, create: true });
                    }}
                  />
                </>
              ) : null}
            </View>
          ) : item.kind === "device" ? (
            <NavigationRow
              label={item.device.name}
              detail={
                item.device.isCurrent
                  ? copy("Bu telefon", "This phone")
                  : copy("Eşleştirilmiş cihaz", "Paired device")
              }
              onPress={() => {
                if (target) setSelected({ target, device: item.device });
              }}
            />
          ) : (
            <NavigationRow
              label={`${item.tunnel.provider} · ${item.tunnel.target}`}
              detail={item.tunnel.publicUrl ?? item.tunnel.localUrl}
              trailing={
                <Badge
                  label={copy(
                    tunnelPresentation(item.tunnel.state).label[0],
                    tunnelPresentation(item.tunnel.state).label[1],
                  )}
                  tone={tunnelPresentation(item.tunnel.state).tone}
                />
              }
              accessibilityLabel={`${item.tunnel.provider} · ${item.tunnel.target}. ${copy(tunnelPresentation(item.tunnel.state).label[0], tunnelPresentation(item.tunnel.state).label[1])}. ${item.tunnel.publicUrl ?? item.tunnel.localUrl}`}
              onPress={() => {
                if (target) setSelected({ target, tunnel: item.tunnel });
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
          onClose={() => setSelected(undefined)}
          onUpdated={() => {
            void query.refetch();
          }}
        />
      ) : null}
      {selected && !changed && !selected.device && report?.tunnels ? (
        <AccessTunnels
          key={`${selected.target.machineId}:${selected.tunnel?.id ?? "new"}`}
          target={selected.target}
          overview={report.tunnels}
          tunnel={selected.tunnel}
          onClose={() => setSelected(undefined)}
          onUpdated={() => {
            void query.refetch();
          }}
        />
      ) : null}
    </>
  );
}
