import { useSecurity } from "../../state/security";
import { autoLockTimeoutOptions } from "../../state/security-preferences";
import type { AutoLockTimeoutMs } from "../../state/security-types";
import { useCopy } from "../../ui/copy";
import {
  Body,
  Button,
  Card,
  ChoiceChip,
  ErrorText,
  Heading,
  Row,
  Section,
  ToggleField,
  Stack,
  Disclosure,
} from "../../ui/primitives";
import { useSecurityError } from "./app-lock";

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
  const prompt = copy(
    "bycoda güvenlik ayarını değiştir",
    "Change bycoda security settings",
  );
  return (
    <Stack>
        {process.env.EXPO_OS === "web" ? (
          <Body muted>
            {copy(
              "Uygulama kilidi, iOS ve Android uygulamalarında telefonunun ekran kilidini kullanır.",
              "App lock uses your phone’s screen lock in the iOS and Android apps.",
            )}
          </Body>
        ) : (
          <>
            <ToggleField
              label={copy("Uygulama kilidi", "App lock")}
              value={security.enabled}
              disabled={security.busy || security.status !== "unlocked"}
              onChange={(value) => {
                void security.setEnabled(value, prompt);
              }}
            />
            <Body muted>
              {copy(
                "Telefonunun ekran kilidi veya biyometrisi ile bilgisayarlarını koru.",
                "Protect access to your computers with your phone’s screen lock or biometrics.",
              )}
            </Body>
            {security.enabled ? (
              <>
                <Heading>{copy("Otomatik kilitle", "Auto-lock")}</Heading>
                <Disclosure label={copy("Kilitleme nasıl çalışır?", "How locking works")}>
                <Body muted>
                  {copy(
                    "Uygulama arka plana geçtiğinde bu sürenin sonunda tekrar giriş gerekir. Bu süre içinde dönersen kaldığın yerden devam edersin. İçerik, arka planda hemen gizlenir.",
                    "Require authentication after this much time away. Return sooner to continue where you left off. Content is hidden immediately in the background.",
                  )}
                </Body>
                </Disclosure>
                <Row>
                  {autoLockTimeoutOptions.map((value) => (
                    <ChoiceChip
                      key={value}
                      label={labels[value]}
                      selected={security.autoLockTimeoutMs === value}
                      disabled={security.busy || security.status !== "unlocked"}
                      onPress={() => {
                        void security.setAutoLockTimeout(value, prompt);
                      }}
                    />
                  ))}
                </Row>
                <Body muted>
                  {copy(
                    "Uygulamayı yeniden açtığında veya Şimdi kilitle’yi kullandığında her zaman giriş gerekir.",
                    "A fresh app launch or Lock now always requires authentication.",
                  )}
                </Body>
              </>
            ) : null}
            {!security.available ? (
              <Button
                label={copy(
                  "Telefon güvenliğini yeniden kontrol et",
                  "Check phone security again",
                )}
                disabled={security.busy}
                onPress={() => {
                  void security.initialize();
                }}
              />
            ) : null}
            <ErrorText
              error={security.error}
              message={describeError(security.error) ?? undefined}
            />
            <Button
              label={copy("Şimdi kilitle", "Lock now")}
              disabled={
                !security.enabled ||
                security.busy ||
                security.status !== "unlocked"
              }
              onPress={security.lock}
            />
          </>
        )}
    </Stack>
  );
}
