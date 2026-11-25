import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { dateTimeFormat } from "../../../../src/shared/lib/intl";
import {
  bundledPolicyUpdate,
  policyDocumentUrl,
  policyUpdateIntervalMs,
  policyUpdateStorageKey,
  readPolicyUpdate,
} from "../../../../src/shared/lib/policyUpdates";
import { useLocale } from "../../i18n";
import { useCopy } from "../../ui/copy";
import { Body, Button, Sheet, Stack } from "../../ui/primitives";

export function PolicyUpdateNotice() {
  const copy = useCopy();
  const locale = useLocale();
  const [update, setUpdate] = useState(bundledPolicyUpdate);
  const [seen, setSeen] = useState<number>();
  // Read the device-local dismissal and refresh the public revision while the app is active.
  useEffect(() => {
    const lifetime = new AbortController();
    let lastCheck = 0;
    const refresh = () => {
      if (AppState.currentState !== "active" || Date.now() - lastCheck < policyUpdateIntervalMs)
        return;
      lastCheck = Date.now();
      readPolicyUpdate(lifetime.signal)
        .then((next) => {
          if (next && !lifetime.signal.aborted)
            setUpdate((current) => (current && current.revision >= next.revision ? current : next));
        })
        .catch(() => {
          lastCheck = 0;
        });
    };
    AsyncStorage.getItem(policyUpdateStorageKey)
      .catch(() => null)
      .then((saved) => {
        if (!lifetime.signal.aborted) setSeen(Number(saved) || 0);
      })
      .catch(() => undefined);
    refresh();
    const state = AppState.addEventListener("change", refresh);
    const timer = setInterval(refresh, policyUpdateIntervalMs);
    return () => {
      lifetime.abort();
      state.remove();
      clearInterval(timer);
    };
  }, []);

  if (!update || seen === undefined || update.revision <= seen) return null;
  const dismiss = () => {
    setSeen(update.revision);
    AsyncStorage.setItem(policyUpdateStorageKey, String(update.revision)).catch(() => undefined);
  };
  return (
    <Sheet visible title={copy("Politika güncellemesi", "Policy update")} onClose={dismiss}>
      <Stack>
        <Body>
          {dateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
            new Date(update.publishedOn),
          )}
        </Body>
        <Body>{copy(update.tr, update.en)}</Body>
        {update.documents.map((document) => (
          <Button
            key={document}
            tone="quiet"
            label={
              document === "privacy"
                ? copy("Gizlilik politikası", "Privacy policy")
                : copy("Kullanım koşulları", "Terms of use")
            }
            onPress={() => Linking.openURL(policyDocumentUrl(document)).catch(() => undefined)}
          />
        ))}
      </Stack>
    </Sheet>
  );
}
