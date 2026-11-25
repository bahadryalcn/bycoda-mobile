import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { DIAGNOSTIC_RETENTION_DAYS } from "../account/contracts";
import { useAccount } from "../account/ui/account-context";
import * as Clipboard from "expo-clipboard";
import { Button, Field, NavigationGroup, Notice, SegmentedRow, Stack, showToast } from "../../ui/primitives";
import { HintSection } from "../../ui/info-hint";
import { useCopy } from "../../ui/copy";
import { useDiagnosticResultText } from "./diagnostic-copy";
import { lastCrashLog, sendDiagnostics, useDiagnosticPrefs } from "./diagnostics-runtime";
import type { DiagnosticMode } from "./diagnostic-prefs";
import type { DiagnosticSendResult } from "./diagnostic-report";
import { diagnosticReceiptsShown, setDiagnosticReceiptsShown, subscribeDiagnosticSharing } from "./diagnostic-sharing";

/** Privacy & data: the diagnostic log sharing choice and a manual "send now". */
export function DiagnosticsSettings() {
  const copy = useCopy();
  const account = useAccount();
  const hydrate = useDiagnosticPrefs((state) => state.hydrate);
  const mode = useDiagnosticPrefs((state) => state.consent.mode);
  const setMode = useDiagnosticPrefs((state) => state.setMode);
  const receipts = useSyncExternalStore(subscribeDiagnosticSharing, diagnosticReceiptsShown);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const noteRevision = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(true);
  // An upload result belongs to this settings instance and submitted note.
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [result, setResult] = useState<DiagnosticSendResult | "save-failed" | null>(null);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const options: { value: DiagnosticMode; label: string; detail: string }[] = [
    { value: "off", label: copy("Gönderme", "Do not send"), detail: copy("Tanılama raporları gönderilmez.", "Diagnostic reports are not sent.") },
    { value: "ask", label: copy("Her seferinde sor", "Ask every time"), detail: copy("Her gönderim için onayın istenir.", "Every report requires approval.") },
    { value: "auto", label: copy("Her seferinde gönder", "Send every time"), detail: copy("Raporu otomatik gönderimden önce inceleyebilirsin.", "You can inspect the report before it sends automatically.") },
  ];
  const choose = (value: DiagnosticMode) => {
    setResult(null);
    setMode(value).catch(() => setResult("save-failed"));
  };
  const copyCrash = async () => {
    const text = lastCrashLog();
    if (!text) {
      showToast({ tone: "info", message: copy("Kayıtlı çökme yok.", "No crash recorded.") });
      return;
    }
    try {
      if (await Clipboard.setStringAsync(text)) {
        showToast({ message: copy("Çökme kaydı kopyalandı.", "Crash log copied.") });
        return;
      }
    } catch {
      // Clipboard rejection and a false result both mean nothing was copied.
    }
    showToast({ tone: "danger", message: copy("Kopyalanamadı. Yeniden dene.", "Could not copy. Try again.") });
  };
  const sendNow = async () => {
    if (pending.current || !mounted.current) return;
    pending.current = true;
    const submittedRevision = noteRevision.current;
    setBusy(true);
    setResult(null);
    try {
      const outcome = await sendDiagnostics(account, "manual", { note });
      if (!mounted.current) return;
      setResult(outcome);
      if (outcome === "sent" && submittedRevision === noteRevision.current) setNote("");
    } catch {
      if (mounted.current) setResult("failed");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const resultText = useDiagnosticResultText();
  const shown: { tone: "success" | "danger" | "info"; text: string } | null =
    result === "save-failed"
      ? { tone: "danger", text: copy("Seçim kaydedilemedi.", "Your choice could not be saved.") }
      : result
        ? { tone: result === "sent" ? "success" : result === "empty" || result === "not-configured" || result === "declined" ? "info" : "danger", text: resultText(result) }
        : null;
  return (
    <HintSection
      title={copy("Tanılama günlükleri", "Diagnostic logs")}
      presentation="visible"
      help={copy(
        "Telefonun gizli bilgileri, e-posta adreslerini ve kullanıcı adını günlüklerden çıkarır. Günlükler konuşmalarını, istemlerini veya kodunu içermez. Gönderilen günlükler {p0} gün saklanır.",
        "Diagnostic logs are the app logs, with secrets, e-mail addresses and your user name removed on this phone. They never include your conversations, prompts or code. They are kept {p0} days.",
        { p0: DIAGNOSTIC_RETENTION_DAYS },
      )}
    >
      <Stack>
        <NavigationGroup>
          <SegmentedRow
            label={copy("Günlükleri paylaş", "Share logs")}
            help={options.map((option) => `${option.label}: ${option.detail}`).join(" ")}
            value={mode ?? "ask"}
            options={options.map(({ value, label }) => ({ value, label }))}
            onChange={choose}
          />
          <SegmentedRow
            label={copy("Gönderim bildirimi", "Data sharing receipts")}
            value={receipts ? "show" : "hide"}
            options={[
              { value: "show", label: copy("Göster", "Show") },
              { value: "hide", label: copy("Gösterme", "Hide") },
            ]}
            onChange={(value) => { void setDiagnosticReceiptsShown(value === "show").catch(() => setResult("save-failed")); }}
          />
        </NavigationGroup>
        <Field
          label={copy("Ne ters gitti? (isteğe bağlı)", "What went wrong? (optional)")}
          value={note}
          maxLength={500}
          onChangeText={(value) => { noteRevision.current++; setNote(value); }}
        />
        <Button
          label={copy("Günlükleri şimdi gönder", "Send logs now")}
          busy={busy}
          disabled={busy || mode === "off"}
          onPress={() => void sendNow()}
        />
        {shown ? <Notice tone={shown.tone} message={shown.text} /> : null}
        <Button
          label={copy("Son çökme kaydını kopyala", "Copy last crash log")}
          tone="quiet"
          flush
          onPress={() => void copyCrash()}
        />
      </Stack>
    </HintSection>
  );
}
