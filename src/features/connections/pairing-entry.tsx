import { useMobileTheme } from "@/ui/theme";
import { Text, View } from "react-native";
import Animated from "react-native-reanimated";
import QrCode from "lucide-react-native/icons/qr-code";
import ClipboardPaste from "lucide-react-native/icons/clipboard-paste";
import PencilLine from "lucide-react-native/icons/pencil-line";
import Wifi from "lucide-react-native/icons/wifi";
import Network from "lucide-react-native/icons/network";
import Laptop from "lucide-react-native/icons/laptop";
import { Body, Button, Card, NavigationGroup, NavigationRow, Row } from "@/ui/primitives";
import { IconTile } from "@/ui/icon-tile";
import { enterItem } from "@/ui/motion";
import { uiStyles } from "@/ui/styles";
import { colors, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { ManualConnectionForm } from "./manual-connection-form";
import { PairingPaste } from "./pairing-paste";
import type { PairingEntryProps } from "./connection-types";

const centered = { alignItems: "center" as const, gap: space.sm };
const title = { textAlign: "center" as const };

function tile(Glyph: typeof QrCode, color: string) {
  return (
    <IconTile color={color}>
      <Glyph size={18} strokeWidth={2} color={color} />
    </IconTile>
  );
}

export function PairingEntry({ controller, disabled }: PairingEntryProps) {
  useMobileTheme();
  const copy = useCopy();
  const { entry, busy } = controller;
  if (entry.kind === "choices")
    return (
      <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
        <View style={centered}>
          <Text selectable accessibilityRole="header" style={[uiStyles.heading, title]}>
            {copy("Bilgisayarına bağlan", "Connect your computer")}
          </Text>
          <Body muted style={title}>
            {copy("Bilgisayarına nasıl ulaşacağını seç.", "Choose how to reach your computer.")}
          </Body>
        </View>
        <NavigationGroup>
          <NavigationRow
            label={copy("Yerel ağ", "Local network")}
            detail={copy("Aynı Wi-Fi veya yerel ağ", "Same Wi-Fi or local network")}
            icon={tile(Wifi, colors.accent)}
            disabled={disabled || busy}
            onPress={() => controller.begin("methods", "lan")}
          />
          <NavigationRow
            label="Tailscale"
            detail={copy("Farklı ağlardan özel bağlantı", "Private access across networks")}
            icon={tile(Network, colors.muted)}
            disabled={disabled || busy}
            onPress={() => controller.begin("methods", "tailscale")}
          />
        </NavigationGroup>
      </Animated.View>
    );
  if (entry.kind === "manual")
    return <ManualConnectionForm controller={controller} disabled={disabled} />;
  if (entry.kind === "paste")
    return (
      <PairingPaste disabled={disabled} onCode={controller.readCode} onCancel={controller.cancel} />
    );
  if (entry.kind === "preview")
    return (
      <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
        <Card style={{ alignItems: "center", gap: space.sm }}>
          <IconTile color={colors.accent} size={56}>
            <Laptop size={26} strokeWidth={2} color={colors.accent} />
          </IconTile>
          <Text selectable style={[uiStyles.heading, title]}>
            {entry.code.name}
          </Text>
          <Body muted style={title}>
            {entry.code.endpoint}
          </Body>
          <Body muted style={title}>
            {entry.code.lanKey
              ? copy("Aynı yerel ağda, şifreli bağlantı.", "Encrypted connection on your local network.")
              : copy("Tailscale özel ağından bağlantı.", "Connection through your private Tailscale network.")}
          </Body>
        </Card>
        {process.env.EXPO_OS === "web" ? (
          <Body muted style={title}>
            {copy("Bilgisayarına telefon uygulamasından bağlan.", "Connect to your computer from the phone app.")}
          </Body>
        ) : null}
        <Button
          label={copy("Bağlan", "Connect")}
          tone="primary"
          fullWidth
          disabled={disabled || process.env.EXPO_OS === "web"}
          busy={busy}
          onPress={() => {
            void controller.connect();
          }}
        />
        <Button
          label={copy("Vazgeç", "Cancel")}
          tone="quiet"
          disabled={busy}
          onPress={controller.cancel}
          style={{ alignSelf: "center" }}
        />
      </Animated.View>
    );
  return (
    <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <View style={centered}>
        <Text selectable accessibilityRole="header" style={[uiStyles.heading, title]}>
          {controller.connectionMode === "lan" ? copy("Yerel ağ", "Local network") : "Tailscale"}
        </Text>
        <Body muted style={title}>
          {copy(
            "Bilgisayarındaki Bycoda’da telefon bağlantısını aç ve QR kodunu tara.",
            "Open phone pairing in Bycoda on your computer and scan its QR code.",
          )}
        </Body>
      </View>
      <NavigationGroup>
        <NavigationRow
          label={copy("QR kodu tara", "Scan QR code")}
          icon={tile(QrCode, colors.accent)}
          disabled={disabled || busy}
          onPress={() => controller.begin("scan")}
        />
        <NavigationRow
          label={copy("Kodu yapıştır", "Paste pairing code")}
          icon={tile(ClipboardPaste, colors.info)}
          disabled={disabled || busy}
          onPress={() => controller.begin("paste")}
        />
        {controller.connectionMode === "tailscale" ? (
          <NavigationRow
            label={copy("Manuel bağlan", "Connect manually")}
            icon={tile(PencilLine, colors.muted)}
            disabled={disabled || busy}
            onPress={() => controller.begin("manual")}
          />
        ) : null}
      </NavigationGroup>
      <Row style={{ justifyContent: "center" }}>
        <Button
          tone="quiet"
          label={copy("Bağlantı türünü değiştir", "Change connection method")}
          disabled={busy}
          onPress={() => controller.begin("choices")}
        />
      </Row>
    </Animated.View>
  );
}
