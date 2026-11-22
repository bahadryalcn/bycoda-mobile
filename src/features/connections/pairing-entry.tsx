import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import QrCode from "lucide-react-native/icons/qr-code";
import ClipboardPaste from "lucide-react-native/icons/clipboard-paste";
import PencilLine from "lucide-react-native/icons/pencil-line";
import { Body, Button, FormActions, Heading, NavigationGroup, NavigationRow, Notice, Row, Stack } from "@/ui/primitives";
import { IconTile } from "@/ui/icon-tile";
import { enterItem } from "@/ui/motion";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { HintLabel } from "@/ui/info-hint";
import { ManualConnectionForm } from "./manual-connection-form";
import { PairingPreview } from "./pairing-preview";
import { PairingPaste } from "./pairing-paste";
import type { PairingEntryProps } from "./connection-types";

const centered = { alignItems: "stretch" as const, gap: space.sm };

function tile(Glyph: typeof QrCode, color: string) {
  return (
    <IconTile color={color}>
      <Glyph size={18} strokeWidth={2} color={color} />
    </IconTile>
  );
}

export function PairingEntry({ controller, disabled }: PairingEntryProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const { entry, busy } = controller;
  if (entry.kind === "choices")
    return (
      <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
        <Stack style={{ gap: space.xs }}>
          <Body muted>{copy(
            "Bilgisayarındaki bycoda’da “Telefon bağla”yı seç ve QR kodunu tara.",
            "In bycoda on your computer, choose “Connect your phone” and scan the QR code.",
          )}</Body>
        </Stack>
        <Button
          label={copy("QR kodu tara", "Scan QR code")}
          tone="primary"
          fullWidth
          disabled={disabled || busy}
          onPress={() => controller.begin("scan")}
        ><QrCode size={20} color={colors.primaryText} /></Button>
        <Button
          label={copy("Kodu yapıştır", "Paste pairing code")}
          tone="secondary" fullWidth
          disabled={disabled || busy}
          onPress={() => controller.begin("paste")}
        />
        <NavigationGroup>
          <NavigationRow
            label={copy("Manuel bağlan", "Connect manually")}
            detail="Tailscale"
            detailLines={0}
            icon={tile(PencilLine, colors.muted)}
            disabled={disabled || busy}
            onPress={() => controller.begin("manual", "tailscale")}
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
  if (entry.kind === "rejected-code")
    return (
      <Stack>
        <Heading>{copy("Bağlantı kodu", "Pairing code")}</Heading>
        <Notice tone="danger" message={entry.message} />
        <FormActions submitLabel={copy("Yeni kod kullan", "Use a new code")} disabled={disabled || busy}
          onSubmit={() => controller.begin("choices")} cancelLabel={copy("Vazgeç", "Cancel")} onCancel={controller.cancel} />
      </Stack>
    );
  if (entry.kind === "preview")
    return <PairingPreview code={entry.code} operation={controller.operation} disabled={disabled}
      busy={busy} onConnect={controller.connect} onCancel={controller.cancel} />;
  return (
    <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <View style={centered}>
        <HintLabel label={controller.connectionMode === "lan" ? copy("Yerel ağ", "Local network") : "Tailscale"} style={uiStyles.heading}
          always help={copy(
            "Bilgisayarındaki bycoda’da “Telefon bağla”yı seç ve QR kodunu tara.",
            "In bycoda on your computer, choose “Connect your phone” and scan the QR code.",
          )} />
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
