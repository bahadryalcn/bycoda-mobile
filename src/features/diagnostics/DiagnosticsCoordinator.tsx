import { useEffect, useRef } from "react";
import { usePathname } from "expo-router";
import { AppState } from "react-native";
import { useAccount } from "../account/ui/account-context";
import { clearCrashMarker, periodicDiagnostics, sendDiagnostics, useDiagnosticPrefs } from "./diagnostics-runtime";
import { logDiagnostic } from "./diagnostic-log";
import { templateRoute } from "./diagnostic-events";
import { decideStartup } from "./diagnostic-startup";
import { expoDiagnosticFiles } from "./expo-diagnostic-files";

export function DiagnosticsCoordinator() {
  const account = useAccount();
  const accountRef = useRef(account);
  accountRef.current = account;
  const hydrate = useDiagnosticPrefs((state) => state.hydrate);
  const hydrated = useDiagnosticPrefs((state) => state.hydrated);
  const mode = useDiagnosticPrefs((state) => state.consent.mode);
  const decided = useRef(false);
  const pathname = usePathname();
  const accountReady = account.status !== "loading";

  useEffect(() => {
    logDiagnostic("info", "mobile.nav", "route", { path: templateRoute(pathname) });
  }, [pathname]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || !accountReady || decided.current || process.env.EXPO_OS === "web") return;
    decided.current = true;
    const action = decideStartup(expoDiagnosticFiles(), mode);
    if (action.kind === "prompt" || action.kind === "send-crash") {
      void sendDiagnostics(accountRef.current, "crash", { includeCrash: true }).then((result) => {
        if (result === "sent" || result === "empty" || result === "declined") clearCrashMarker();
      }).catch(() => undefined);
    }
  }, [hydrated, accountReady, mode]);

  useEffect(() => {
    if (!hydrated || !accountReady || mode !== "auto" || process.env.EXPO_OS === "web") return;
    const run = () => periodicDiagnostics.run(() => sendDiagnostics(accountRef.current, "periodic"));
    void run().catch(() => undefined);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void run().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [hydrated, accountReady, mode]);

  return null;
}
