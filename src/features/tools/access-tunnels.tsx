import { Body, ScopeLine, Sheet, StatusText } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { HostAccessReport } from "./access-center-model";
import { tunnelPresentation } from "./tunnel-presentation";

export type AccessTunnel = NonNullable<HostAccessReport["tunnels"]>["tunnels"][number];

export function AccessTunnels({ computer, tunnel, onClose }: {
  computer?: string;
  tunnel: AccessTunnel;
  onClose: () => void;
}) {
  const copy = useCopy();
  const provider = tunnel.provider === "cloudflare" ? "Cloudflare" : "ngrok";
  const target = tunnel.target === "host"
    ? copy("Bilgisayar erişimi", "Computer access")
    : copy("Geliştirme sunucusu", "Dev server");
  const { label, tone } = tunnelPresentation(tunnel.state);
  return (
    <Sheet visible title={`${provider} · ${target}`} size="compact" onClose={onClose}>
      <ScopeLine scope={{ computer }} />
      <StatusText label={copy(label[0], label[1])} tone={tone === "success" ? "info" : tone} />
      {tunnel.publicUrl ? <>
        <Body mono selectable>{tunnel.publicUrl}</Body>
        <Body muted>{copy("Genel adres doğrulanmadı.", "Public address reachability is unverified.")}</Body>
      </> : null}
      <Body mono muted selectable>{tunnel.localUrl}</Body>
      <Body muted>{copy("Tünelleri bilgisayardaki bycoda’dan yönetin.", "Manage tunnels in bycoda on the computer.")}</Body>
    </Sheet>
  );
}
