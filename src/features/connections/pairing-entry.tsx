import { View } from "react-native";
import QrCode from "lucide-react-native/icons/qr-code";
import Wifi from "lucide-react-native/icons/wifi";
import Network from "lucide-react-native/icons/network";
import Laptop from "lucide-react-native/icons/laptop";
import { Body, Button, Card, Heading, NavigationGroup, NavigationRow, Row } from "@/ui/primitives";
import { colors, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { ManualConnectionForm } from "./manual-connection-form";
import { PairingPaste } from "./pairing-paste";
import type { PairingEntryProps } from "./connection-types";

export function PairingEntry({ controller, disabled }: PairingEntryProps) {
  const copy = useCopy();
  const { entry, busy } = controller;
  if (entry.kind === "choices") return <View style={{ gap: space.lg }}>
    <Heading>{copy("Bilgisayarına bağlan", "Connect your computer")}</Heading>
    <NavigationGroup>
      <NavigationRow label={copy("Yerel ağ", "Local network")} detail={copy("Aynı Wi-Fi veya yerel ağ", "Same Wi-Fi or local network")} icon={<Wifi size={22} color={colors.accent} />} disabled={disabled || busy} onPress={() => controller.begin("methods", "lan")} />
      <NavigationRow label="Tailscale" detail={copy("Farklı ağlardan özel bağlantı", "Private access across networks")} icon={<Network size={22} color={colors.muted} />} disabled={disabled || busy} onPress={() => controller.begin("methods", "tailscale")} />
    </NavigationGroup>
  </View>;
  if (entry.kind === "manual") return <ManualConnectionForm controller={controller} disabled={disabled} />;
  if (entry.kind === "paste") return <PairingPaste disabled={disabled} onCode={controller.readCode} onCancel={controller.cancel} />;
  if (entry.kind === "preview") return <View style={{ gap: space.lg }}>
    <Card>
      <Row><Laptop size={24} color={colors.accent} /><Heading>{entry.code.name}</Heading></Row>
      <Body muted>{entry.code.endpoint}</Body>
      <Body muted>{entry.code.lanKey
        ? copy("Aynı yerel ağda, şifreli bağlantı.", "Encrypted connection on your local network.")
        : copy("Tailscale özel ağından bağlantı.", "Connection through your private Tailscale network.")}</Body>
    </Card>
    {process.env.EXPO_OS === "web" ? <Body muted>{copy("Bilgisayarına telefon uygulamasından bağlan.", "Connect to your computer from the phone app.")}</Body> : null}
    <Button label={copy("Bağlan", "Connect")} tone="primary" disabled={disabled || process.env.EXPO_OS === "web"} busy={busy} onPress={() => { void controller.connect(); }} />
    <Button label={copy("Vazgeç", "Cancel")} tone="quiet" disabled={busy} onPress={controller.cancel} />
  </View>;
  return <View style={{ gap: space.lg }}>
    <Heading>{controller.connectionMode === "lan" ? copy("Yerel ağ", "Local network") : "Tailscale"}</Heading>
    <Body muted>{copy("Bilgisayarındaki Bycoda’da telefon bağlantısını aç ve QR kodunu tara.", "Open phone pairing in Bycoda on your computer and scan its QR code.")}</Body>
    <Button label={copy("QR kodu tara", "Scan QR code")} tone="primary" disabled={disabled || busy} onPress={() => controller.begin("scan")}><QrCode color={colors.primaryText} size={20} /></Button>
    <NavigationGroup>
      <NavigationRow label={copy("Kodu yapıştır", "Paste pairing code")} disabled={disabled || busy} onPress={() => controller.begin("paste")} />
      {controller.connectionMode === "tailscale" ? <NavigationRow label={copy("Manuel bağlan", "Connect manually")} disabled={disabled || busy} onPress={() => controller.begin("manual")} /> : null}
    </NavigationGroup>
    <Button tone="quiet" label={copy("Bağlantı türünü değiştir", "Change connection method")} disabled={busy} onPress={() => controller.begin("choices")} />
  </View>;
}

