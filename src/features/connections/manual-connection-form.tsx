import { ConnectionFeedback } from "./connection-feedback";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { Body, ErrorNotice, FormActions, Disclosure, Field, Heading, IdentifierField, Stack } from "@/ui/primitives";
import { remoteErrorKind } from "@/ui/error-message";
import { enterItem } from "@/ui/motion";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import type { ManualConnectionFormProps } from "./connection-types";

export function ManualConnectionForm({ controller, disabled }: ManualConnectionFormProps) {
  const copy = useCopy();
  const { form, busy } = controller;
  const { name, endpoint, token, target } = form.values;
  const editing = target?.kind === "existing";
  const error = controller.operation.error;
  const timedOut = remoteErrorKind(error) === "timeout";
  return (
    <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Heading>
          {editing
            ? copy("Bağlantıyı yenile", "Update connection")
            : copy("Manuel bağlan", "Connect manually")}
        </Heading>
        <Body muted>
          {controller.connectionMode === "lan"
            ? copy(
                "Bilgisayarının ağ adresi değiştiyse yenisini gir.",
                "Enter your computer’s new address if it changed.",
              )
            : copy(
                "Bilgisayarının Tailscale adresini ve cihaz anahtarını gir.",
                "Enter your computer’s Tailscale address and device key.",
              )}
        </Body>
      </View>
      <Stack>
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
        <Field
            label={copy("Bilgisayar adı (isteğe bağlı)", "Computer name (optional)")}
            value={name}
            onChangeText={(value) => form.setField("name", value)}
            editable={!busy && !disabled}
            placeholder={copy("Çalışma bilgisayarım", "My work computer")}
        />
      </Stack>
      {controller.connectionMode === "tailscale" ? (
        <Disclosure label={copy("Cihaz anahtarını nereden alırım?", "Where do I get a device key?")}>
          <Body muted>
            {copy(
              'Bilgisayarda: bycoda-host pair --name "My phone". HTTPS erişimi için özel ağındaki Tailscale Serve adresini kullan.',
              'On the computer: bycoda-host pair --name "My phone". Use your private Tailscale Serve address for HTTPS access.',
            )}
          </Body>
        </Disclosure>
      ) : null}
      <FormActions
        feedback={error && !busy
          ? <ErrorNotice error={error} message={timedOut ? copy(
            "Bilgisayar yanıt vermedi. Adresi kontrol edip tekrar dene.",
            "The computer did not answer. Check the address and try again.",
          ) : undefined} />
          : <ConnectionFeedback operation={controller.operation} />}
        submitLabel={editing ? copy("Bağlantıyı kaydet", "Save connection") : copy("Bağlan", "Connect")}
        onSubmit={() => {
          void controller.connect();
        }}
        busy={busy}
        disabled={
          disabled ||
          !endpoint.trim() ||
          (!(controller.connectionMode === "lan" && editing) && !token.trim())
        }
        cancelLabel={copy("Vazgeç", "Cancel")}
        cancelDisabled={busy}
        onCancel={controller.cancel}
      />
      {process.env.EXPO_OS === "web" ? (
        <Body muted style={{ textAlign: "center" }}>
          {copy(
            "Tarayıcı önizlemesi bağlantı anahtarını kaydetmez. Gerçek host bağlantısı native uygulamadan yapılır.",
            "The browser preview does not store your device key. Connect to your real host from the native app.",
          )}
        </Body>
      ) : null}
    </Animated.View>
  );
}
