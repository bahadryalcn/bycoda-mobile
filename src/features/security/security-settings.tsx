import Animated from "react-native-reanimated";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import Timer from "lucide-react-native/icons/timer";
import Lock from "lucide-react-native/icons/lock";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useSecurity } from "../../state/security";
import { autoLockTimeoutOptions } from "../../state/security-preferences";
import type { AutoLockTimeoutMs } from "../../state/security-types";
import { useCopy } from "../../ui/copy";
import {
  Body,
  Disclosure,
  ErrorText,
  NavigationGroup,
  NavigationRow,
  SelectField,
  Stack,
  ToggleField,
} from "../../ui/primitives";
import { IconTile } from "../../ui/icon-tile";
import { enterItem } from "../../ui/motion";
import { colors, space } from "../../ui/tokens";
import { useSecurityError } from "./app-lock";

function tile(Glyph: typeof Lock, color: string) {
  return (
    <IconTile color={color}>
      <Glyph size={18} strokeWidth={2} color={color} />
    </IconTile>
  );
}

export function SecuritySettings() {
  const copy = useCopy();
  const security = useSecurity();
  const describeError = useSecurityError();
  const labels: Record<AutoLockTimeoutMs, string> = {
    0: copy("Hemen", "Immediately"),
    30000: copy("30 saniye", "30 seconds"),
    60000: copy("1 dakika", "1 minute"),
    300000: copy("5 dakika", "5 minutes"),
    900000: copy("15 dakika", "15 minutes"),
  };
  const prompt = copy("bycoda güvenlik ayarını değiştir", "Change bycoda security settings");
  const idle = security.busy || security.status !== "unlocked";
  if (process.env.EXPO_OS === "web")
    return (
      <Stack>
        <Body muted>
          {copy(
            "Uygulama kilidi, iOS ve Android uygulamalarında telefonunun ekran kilidini kullanır.",
            "App lock uses your phone’s screen lock in the iOS and Android apps.",
          )}
        </Body>
      </Stack>
    );
  return (
    <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <NavigationGroup>
        <ToggleField
          label={copy("Uygulama kilidi", "App lock")}
          detail={copy(
            "Bilgisayarlarını telefonunun ekran kilidi veya biyometrisiyle koru.",
            "Protect your computers with your phone’s screen lock or biometrics.",
          )}
          value={security.enabled}
          disabled={idle}
          onChange={(value) => {
            void security.setEnabled(value, prompt);
          }}
        />
      </NavigationGroup>
      {security.enabled ? (
        <Stack style={{ gap: space.sm }}>
          <NavigationGroup>
            <SelectField
              variant="row"
              icon={tile(Timer, colors.warning)}
              label={copy("Otomatik kilitle", "Auto-lock")}
              value={String(security.autoLockTimeoutMs)}
              disabled={idle}
              options={autoLockTimeoutOptions.map((value) => ({
                value: String(value),
                label: labels[value],
              }))}
              onChange={(value) => {
                void security.setAutoLockTimeout(Number(value) as AutoLockTimeoutMs, prompt);
              }}
            />
          </NavigationGroup>
          <Disclosure label={copy("Kilitleme nasıl çalışır?", "How locking works")}>
            <Body muted>
              {copy(
                "Uygulama arka plana geçtiğinde bu sürenin sonunda tekrar giriş gerekir. Bu süre içinde dönersen kaldığın yerden devam edersin. İçerik arka planda hemen gizlenir. Uygulamayı yeniden açtığında veya Şimdi kilitle’yi kullandığında her zaman giriş gerekir.",
                "Authentication is required after this much time in the background. Return sooner to continue where you left off. Content is hidden immediately in the background. A fresh app launch or Lock now always requires authentication.",
              )}
            </Body>
          </Disclosure>
        </Stack>
      ) : null}
      {!security.available ? (
        <NavigationGroup>
          <NavigationRow
            label={copy("Telefon güvenliğini yeniden kontrol et", "Check phone security again")}
            icon={tile(RefreshCw, colors.info)}
            disabled={security.busy}
            onPress={() => {
              void security.initialize();
            }}
          />
        </NavigationGroup>
      ) : null}
      <ErrorText error={security.error} message={describeError(security.error) ?? undefined} />
      <NavigationGroup>
        <NavigationRow
          label={copy("Şimdi kilitle", "Lock now")}
          icon={tile(LockKeyhole, colors.accent)}
          disabled={!security.enabled || security.busy || security.status !== "unlocked"}
          onPress={security.lock}
        />
      </NavigationGroup>
    </Animated.View>
  );
}
