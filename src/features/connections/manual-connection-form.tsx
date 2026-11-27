import { ConnectionFeedback } from "./connection-feedback";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { Body, ErrorNotice, FormActions, Field, Heading, IdentifierField, Stack } from "@/ui/primitives";
import { remoteErrorKind } from "@/ui/error-message";
import { enterItem } from "@/ui/motion";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import type { ManualConnectionFormProps } from "./connection-types";

export function ManualConnectionForm({ controller, disabled }: ManualConnectionFormProps) {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const { form, busy } = controller;
  const { name, endpoint, token, target } = form.values;
  const editing = target?.kind === "existing";
  const error = controller.operation.error;
  const timedOut = remoteErrorKind(error) === "timeout";
  // A local-network computer keeps its key behind the pairing; other routes may replace it, optionally when editing.
  const showToken = !(controller.connectionMode === "lan" && editing);
  return (
    <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        {/* Editing is titled "Edit connection" by the screen header, matching the row that opens it. */}
        {editing ? null : <Heading>{copy("Manuel bağlan", "Connect manually")}</Heading>}
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
        {showToken ? (
          <View style={{ gap: space.xs }}>
            <IdentifierField
              label={editing
                ? copy("Yeni cihaz anahtarı (isteğe bağlı)", "New device key (optional)")
                : copy("Cihaz anahtarı", "Device key")}
              value={token}
              onChangeText={(value) => form.setField("token", value)}
              autoComplete="off"
              secureTextEntry
              textContentType="password"
              editable={!busy && !disabled}
              placeholder={editing ? copy("Kayıtlı anahtarı korumak için boş bırak", "Leave empty to keep the saved key") : undefined}
              info={controller.connectionMode === "tailscale" ? copy(
                "HTTPS erişimi için özel ağındaki Tailscale Serve adresini kullan.",
                "Use your private Tailscale Serve address for HTTPS access.",
              ) : undefined}
            />
            {controller.tokenCleared && !token ? (
              <Body muted style={uiStyles.caption}>{copy(
                "Güvenlik için cihaz anahtarı silindi. Yeniden yapıştır.",
                "The device key was cleared for safety. Paste it again.",
              )}</Body>
            ) : editing ? null : (
              <Body muted style={uiStyles.caption}>{copy(
                'Anahtarı bilgisayarda oluştur: bycoda-host pair --name "My phone"',
                'Create the key on the computer: bycoda-host pair --name "My phone"',
              )}</Body>
            )}
          </View>
        ) : null}
        <Field
            label={copy("Bilgisayar adı (isteğe bağlı)", "Computer name (optional)")}
            value={name}
            onChangeText={(value) => form.setField("name", value)}
            editable={!busy && !disabled}
            placeholder={copy("Çalışma bilgisayarım", "My work computer")}
        />
      </Stack>
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
          (!editing && !token.trim())
        }
        cancelLabel={copy("Vazgeç", "Cancel")}
        cancelDisabled={busy}
        onCancel={controller.cancel}
      />
      {process.env.EXPO_OS === "web" ? (
        <Body muted style={{ textAlign: "center" }}>
          {copy(
            "Tarayıcı önizlemesi cihaz anahtarını kaydetmez. Gerçek bilgisayarına mobil uygulamadan bağlan.",
            "The browser preview does not store your device key. Connect to your real host from the native app.",
          )}
        </Body>
      ) : null}
    </Animated.View>
  );
}
