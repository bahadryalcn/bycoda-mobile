import { useMobileTheme } from "@/ui/theme";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import Laptop from "lucide-react-native/icons/laptop";
import { Body, FormActions, Heading, Row } from "@/ui/primitives";
import { IconTile } from "@/ui/icon-tile";
import { enterItem } from "@/ui/motion";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { ConnectionFeedback } from "./connection-feedback";
import type { ConnectionOperation } from "./connection-types";
import type { MobilePairingCode } from "./pairing-code";

/** A reviewed identity stays fully readable; the connection owner retains claims and credentials. */
export function PairingPreview({ code, operation, disabled, busy, onConnect, onCancel }: {
  code: MobilePairingCode; operation: ConnectionOperation; disabled: boolean; busy: boolean;
  onConnect: () => Promise<unknown>; onCancel: () => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  return (
      <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Row style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
          <IconTile color={colors.muted}>
            <Laptop size={20} strokeWidth={2} color={colors.muted} />
          </IconTile>
          <Heading style={{ flex: 1, textAlign: "left" }}>{code.name}</Heading>
          </Row>
          <Body muted style={{ textAlign: "left" }}>
            {code.endpoint}
          </Body>
          <Body muted style={{ textAlign: "left" }}>
            {code.lanKey
              ? copy("Aynı yerel ağda, şifreli bağlantı.", "Encrypted connection on your local network.")
              : copy("Tailscale özel ağından bağlantı.", "Connection through your private Tailscale network.")}
          </Body>
        </View>
        {process.env.EXPO_OS === "web" ? (
          <Body muted style={{ textAlign: "left" }}>
            {copy("Bilgisayarına telefon uygulamasından bağlan.", "Connect to your computer from the phone app.")}
          </Body>
        ) : null}
        <FormActions
          feedback={<ConnectionFeedback operation={operation} onRetry={disabled ? undefined : () => { void onConnect(); }} />}
          submitLabel={copy("Bağlan", "Connect")}
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
