import { useEffect, useRef, useState } from "react";
import { router, usePathname, type Href } from "expo-router";
import { AppState } from "react-native";
import { useAccount } from "../account/ui/account-context";
import { Body, Button, ErrorNotice, FormActions, Sheet, Stack, ToggleField, showToast } from "../../ui/primitives";
import { useCopy } from "../../ui/copy";
import { diagnosticPrefs, clearCrashMarker, sendDiagnostics, useDiagnosticPrefs } from "./diagnostics-runtime";
import { useDiagnosticResultText } from "./diagnostic-copy";
import { logDiagnostic } from "./diagnostic-log";
import { templateRoute } from "./diagnostic-events";
import { decideStartup, shouldSendPeriodic } from "./diagnostic-startup";
import { expoDiagnosticFiles } from "./expo-diagnostic-files";
import type { DiagnosticSendResult } from "./diagnostic-report";

const settled = (result: DiagnosticSendResult) => result === "sent" || result === "not-configured" || result === "empty";

/**
 * Handles the previous run's crash marker (send, ask or discard by the saved choice) and the weekly
 * automatic upload. The prompt is one compact sheet: a plain explanation, Send / Not now, and an
 * "always send" switch; nothing is uploaded before the choice.
 */
export function DiagnosticsCoordinator() {
  const copy = useCopy();
  const account = useAccount();
  const accountRef = useRef(account);
  accountRef.current = account;
  const hydrate = useDiagnosticPrefs((state) => state.hydrate);
  const hydrated = useDiagnosticPrefs((state) => state.hydrated);
  const mode = useDiagnosticPrefs((state) => state.consent.mode);
  const setMode = useDiagnosticPrefs((state) => state.setMode);
  const [prompting, setPrompting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DiagnosticSendResult | null>(null);
  const [always, setAlways] = useState(false);
  const resultText = useDiagnosticResultText();
  const decided = useRef(false);
  const pathname = usePathname();
  useEffect(() => {
    logDiagnostic("info", "mobile.nav", "route", { path: templateRoute(pathname) });
  }, [pathname]);
  const accountReady = account.status !== "loading";

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || !accountReady || decided.current || process.env.EXPO_OS === "web") return;
    decided.current = true;
    const action = decideStartup(expoDiagnosticFiles(), mode);
    if (action.kind === "prompt") setPrompting(true);
    else if (action.kind === "send-crash")
      void sendDiagnostics(accountRef.current, "crash", { includeCrash: true }).then((result) => {
        if (settled(result)) clearCrashMarker();
      });
  }, [hydrated, accountReady, mode]);

  useEffect(() => {
    if (!hydrated || !accountReady || mode !== "auto" || process.env.EXPO_OS === "web") return;
    const run = async () => {
      const last = await diagnosticPrefs.readLastPeriodic();
      if (!shouldSendPeriodic(mode, last, new Date())) return;
      const result = await sendDiagnostics(accountRef.current, "periodic");
      if (result === "sent") await diagnosticPrefs.writeLastPeriodic(new Date());
    };
    void run().catch(() => undefined);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void run().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [hydrated, accountReady, mode]);

  if (!prompting) return null;
  const finish = async (choice: "send" | "never") => {
    if (choice === "never") {
      clearCrashMarker();
      setPrompting(false);
      return;
    }
    setBusy(true);
    try {
      if (always) await setMode("auto");
      const outcome = await sendDiagnostics(accountRef.current, "crash", { includeCrash: true });
      if (settled(outcome)) {
        clearCrashMarker();
        setPrompting(false);
        setFailure(null);
        if (outcome === "sent") showToast({ tone: "success", message: resultText("sent") });
      } else setFailure(outcome); // The marker stays, so Send can be tried again.
    } catch {
      setFailure("failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible
      size="compact"
      title={copy("Uygulama beklenmedik şekilde kapandı", "The app closed unexpectedly")}
      dismissible={!busy}
      onClose={() => void finish("never")}
    >
      <Stack>
        <Body>
          {copy(
            "Bize bir hata raporu göndererek bunu düzeltmemize yardım edebilirsin. Rapor yalnızca uygulamanın teknik kayıtlarını içerir; sohbetlerin ve kişisel bilgilerin gönderilmez.",
            "You can help us fix this by sending an error report. It only contains the app's technical logs; your conversations and personal details are never included.",
          )}
        </Body>
        <ToggleField
          label={copy("Bundan sonra otomatik gönder", "Send automatically from now on")}
          value={always}
          onChange={setAlways}
          disabled={busy}
        />
        <Button
          label={copy("Ne olduğunu anlat", "Tell us what happened")}
          tone="quiet"
          disabled={busy}
          onPress={() => {
            setPrompting(false);
            router.push("/feedback?crash=1" as Href);
          }}
        />
        <FormActions
          submitLabel={copy("Raporu gönder", "Send report")}
          onSubmit={() => void finish("send")}
          cancelLabel={copy("Şimdi değil", "Not now")}
          onCancel={() => void finish("never")}
          busy={busy}
          feedback={failure ? <ErrorNotice error={failure} message={resultText(failure)} /> : undefined}
        />
      </Stack>
    </Sheet>
  );
}
