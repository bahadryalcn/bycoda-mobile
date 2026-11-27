import Animated from "react-native-reanimated";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import Timer from "lucide-react-native/icons/timer";
import Lock from "lucide-react-native/icons/lock";
import { useSecurity } from "../../state/security";
import { autoLockTimeoutOptions } from "../../state/security-preferences";
import type { AutoLockTimeoutMs } from "../../state/security-types";
import { useCopy } from "../../ui/copy";
import {
  ErrorNotice,
  NavigationGroup,
  NavigationRow,
  Notice,
  SelectField,
  SettingIcon,
  StateView,
  ToggleField,
} from "../../ui/primitives";
import { enterItem } from "../../ui/motion";
import { space } from "../../ui/tokens";
import { useSecurityError } from "./app-lock";

/** Settings → App lock: the switch, auto-lock delay and Lock now. */
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
    // Same page-level info state as Phone permissions on web.
    return (
      <StateView
        compact={false}
        tone="info"
        title={copy(
          "Uygulama kilidi, iOS ve Android uygulamalarında telefonunun ekran kilidini kullanır.",
          "App lock uses your phone’s screen lock in the iOS and Android apps.",
        )}
      />
    );
  return (
    <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <ErrorNotice error={security.error} message={describeError(security.error) ?? undefined} />
      {!security.available && security.status === "unlocked" && !security.error ? (
        // Why the switch cannot turn on, with the way to check again once the phone has a screen lock.
        <Notice
          tone="warning"
          message={copy(
            "Uygulama kilidi için telefonunda ekran kilidi veya biyometri ayarlı olmalı.",
            "App lock needs a screen lock or biometrics set up on this phone.",
          )}
          action={{ label: copy("Yeniden kontrol et", "Check again"), onPress: () => { if (!security.busy) void security.initialize(); } }}
        />
      ) : null}
      {/* One group: the switch, then the delay and Lock now, which only exist while the lock is on. */}
      <NavigationGroup>
        <ToggleField
          label={copy("Uygulama kilidi", "App lock")}
          icon={<SettingIcon glyph={Lock} />}
          help={copy(
            "Bilgisayarlarını telefonunun ekran kilidi veya biyometrisiyle koru.",
            "Protect your computers with your phone’s screen lock or biometrics.",
          )}
          value={security.enabled}
          disabled={idle}
          onChange={(value) => {
            void security.setEnabled(value, prompt);
          }}
        />
        {security.enabled ? (
          <SelectField
            variant="row"
            icon={<SettingIcon glyph={Timer} />}
            label={copy("Otomatik kilitle", "Auto-lock")}
            hint={copy(
              "Uygulama arka planda seçtiğin süre kalınca kilitlenir. İçerik arka planda hemen gizlenir.",
              "The app locks after the chosen time in the background. Content is hidden immediately in the background.",
            )}
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
        ) : null}
        {security.enabled ? (
          <NavigationRow
            label={copy("Şimdi kilitle", "Lock now")}
            intent="command"
            icon={<SettingIcon glyph={LockKeyhole} />}
            separator={false}
            disabled={security.busy || security.status !== "unlocked"}
            onPress={security.lock}
          />
        ) : null}
      </NavigationGroup>
    </Animated.View>
  );
}
