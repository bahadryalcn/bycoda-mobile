import Laptop from "lucide-react-native/icons/laptop";
import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { Body, FormActions, Heading, Row, RowIcon, StatusText } from "@/ui/primitives";
import { enterItem } from "@/ui/motion";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { ConnectionFeedback } from "./connection-feedback";
import type { ConnectionOperation } from "./connection-types";
import { pairingRouteIsPublic, type MobilePairingCode } from "./pairing-code";

/** A reviewed identity stays fully readable; the connection owner retains claims and credentials. */
export function PairingPreview({ code, operation, disabled, busy, onConnect, onCancel }: {
  code: MobilePairingCode; operation: ConnectionOperation; disabled: boolean; busy: boolean;
  onConnect: () => Promise<unknown>; onCancel: () => void;
}) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  return (
      <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Row style={{ flexWrap: "nowrap", alignItems: "center" }}>
            <View accessible={false} style={uiStyles.rowLeading}><RowIcon glyph={Laptop} /></View>
            <Heading style={{ flex: 1, textAlign: "left" }}>{code.name}</Heading>
          </Row>
          <Body muted style={{ textAlign: "left" }}>
            {code.endpoint}
          </Body>
          {/* The same rule the saved route uses: a public route is announced before connecting, not after. */}
          {pairingRouteIsPublic(code) ? (
            <StatusText tone="warning" label={copy(
              "Genel internet üzerinden bağlantı. Erişim yalnızca cihaz anahtarıyla korunur.",
              "Connection over the public internet. Access is protected only by the device key.",
            )} />
          ) : (
            <Body muted style={{ textAlign: "left" }}>
              {code.lanKey
                ? copy("Aynı yerel ağda, şifreli bağlantı.", "Encrypted connection on your local network.")
                : copy("Tailscale özel ağından bağlantı.", "Connection through your private Tailscale network.")}
            </Body>
          )}
        </View>
        {process.env.EXPO_OS === "web" ? (
          <Body muted style={{ textAlign: "left" }}>
            {copy("Bilgisayarına telefon uygulamasından bağlan.", "Connect to your computer from the phone app.")}
          </Body>
        ) : null}
        <FormActions
          feedback={<ConnectionFeedback operation={operation} />}
          submitLabel={operation.isError ? copy("Yeniden dene", "Retry") : copy("Bağlan", "Connect")}
          disabled={disabled || process.env.EXPO_OS === "web"}
          busy={busy}
          onSubmit={() => {
            void onConnect();
          }}
          cancelLabel={copy("Vazgeç", "Cancel")}
          onCancel={onCancel}
          cancelDisabled={busy}
        />
      </Animated.View>
  );
}
