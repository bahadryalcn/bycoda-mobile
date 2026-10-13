import { View } from "react-native";
import { Body, Button, Disclosure, Field, Heading, IdentifierField } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import type { ManualConnectionFormProps } from "./connection-types";

export function ManualConnectionForm({ controller, disabled }: ManualConnectionFormProps) {
  const copy = useCopy();
  const { form, busy } = controller;
  const { name, endpoint, token, target } = form.values;
  const editing = target?.kind === "existing";
  return (
    <View style={{ gap: space.lg }}>
      <Heading>
        {editing
          ? copy("Bağlantıyı yenile", "Update connection")
          : copy("Manuel bağlan", "Connect manually")}
      </Heading>
      <Body muted>
        {controller.connectionMode === "lan"
          ? copy(
              "Yerel ağ adresini güncelle. Bilgisayarın QR koduyla doğrulanan anahtarı korunur. Başka bir bilgisayar için yeni kod tara.",
              "Update the local network address. The computer key verified by its QR code is retained. Scan a new code for another computer.",
            )
          : copy(
              "Bilgisayarındaki Bycoda Host için HTTPS adresini ve cihaz anahtarını gir.",
              "Enter your Bycoda Host HTTPS address and device key.",
            )}
      </Body>
      <IdentifierField
        label={copy("Bilgisayar adresi", "Computer address")}
        value={endpoint}
        onChangeText={(value) => form.setField("endpoint", value)}
        editable={!busy && !disabled}
        keyboardType="url"
        placeholder={
          controller.connectionMode === "lan"
            ? "http://192.168.1.20:3777"
            : "https://computer.example.ts.net"
        }
      />
      {!(controller.connectionMode === "lan" && editing) ? (
        <IdentifierField
          label={copy("Cihaz anahtarı", "Device key")}
          value={token}
          onChangeText={(value) => form.setField("token", value)}
          autoComplete="off"
          secureTextEntry
          textContentType="password"
          editable={!busy && !disabled}
        />
      ) : null}
      <Disclosure label={copy("Ad (isteğe bağlı)", "Name (optional)")} defaultExpanded={editing}>
        <Field
          label={copy("Bilgisayar adı", "Computer name")}
          value={name}
          onChangeText={(value) => form.setField("name", value)}
          editable={!busy && !disabled}
          placeholder={copy("Çalışma bilgisayarım", "My work computer")}
        />
      </Disclosure>
      <Button
        label={copy("Bağlan", "Connect")}
        onPress={() => {
          void controller.connect();
        }}
        busy={busy}
        disabled={
          disabled ||
          !endpoint.trim() ||
          (!(controller.connectionMode === "lan" && editing) && !token.trim())
        }
        tone="primary"
      />
      <Button label={copy("Vazgeç", "Cancel")} tone="quiet" disabled={busy} onPress={controller.cancel} />
      {controller.connectionMode === "tailscale" ? (
        <Disclosure label={copy("Cihaz anahtarını nereden alırım?", "Where do I get a device key?")}><Body muted>
          {copy(
            'Bilgisayarda: bycoda-host pair --name "My phone". HTTPS erişimi için özel ağındaki Tailscale Serve adresini kullan.',
            'On the computer: bycoda-host pair --name "My phone". Use your private Tailscale Serve address for HTTPS access.',
          )}
        </Body></Disclosure>
      ) : null}
      {process.env.EXPO_OS === "web" ? (
        <Body muted>
          {copy(
            "Tarayıcı önizlemesi bağlantı anahtarını kaydetmez. Gerçek host bağlantısı native uygulamadan yapılır.",
            "The browser preview does not store your device key. Connect to your real host from the native app.",
          )}
        </Body>
      ) : null}
    </View>
  );
}
