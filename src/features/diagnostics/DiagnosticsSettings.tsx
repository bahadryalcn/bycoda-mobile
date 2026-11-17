import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DIAGNOSTIC_RETENTION_DAYS } from "../account/contracts";
import { useAccount } from "../account/ui/account-context";
import * as Clipboard from "expo-clipboard";
import { Button, Field, NavigationGroup, Notice, SegmentedRow, Stack } from "../../ui/primitives";
import { HintSection } from "../../ui/info-hint";
import { useCopy } from "../../ui/copy";
import { useDiagnosticResultText } from "./diagnostic-copy";
import { lastCrashLog, sendDiagnostics, useDiagnosticPrefs } from "./diagnostics-runtime";
import type { DiagnosticMode } from "./diagnostic-prefs";
import type { DiagnosticSendResult } from "./diagnostic-report";

/** Privacy & data: the diagnostic log sharing choice and a manual "send now". */
export function DiagnosticsSettings() {
  const copy = useCopy();
  const account = useAccount();
  const hydrate = useDiagnosticPrefs((state) => state.hydrate);
  const mode = useDiagnosticPrefs((state) => state.consent.mode);
  const setMode = useDiagnosticPrefs((state) => state.setMode);
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
    { value: "off", label: copy("Kapalı", "Off"), detail: copy("Günlükleri şimdi gönder demedikçe hiçbir şey gönderilmez.", "Nothing is sent unless you choose Send logs now.") },
    { value: "ask", label: copy("Bana sor", "Ask me"), detail: copy("Çökmeden sonra göndermek isteyip istemediğin sorulur.", "After a crash you are asked whether to send them.") },
    { value: "auto", label: copy("Otomatik", "Automatic"), detail: copy("Çökme raporları sormadan gönderilir.", "Crash reports are sent without asking.") },
  ];
  const choose = (value: DiagnosticMode) => {
    setResult(null);
    setMode(value).catch(() => setResult("save-failed"));
  };
  const [copied, setCopied] = useState<boolean | null>(null);
  const copyCrash = async () => {
    const text = lastCrashLog();
    if (!text) return setCopied(false);
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
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
        ? { tone: result === "sent" ? "success" : result === "empty" || result === "not-configured" ? "info" : "danger", text: resultText(result) }
        : null;
  return (
    <HintSection
      title={copy("Tanılama günlükleri", "Diagnostic logs")}
      help={copy(
        "Tanılama günlükleri uygulama günlükleridir; gizli bilgiler, e-posta adresleri ve kullanıcı adın bu telefonda çıkarılır. Konuşmalarını, istemlerini veya kodunu asla içermez. {p0} gün saklanır.",
        "Diagnostic logs are the app logs, with secrets, e-mail addresses and your user name removed on this phone. They never include your conversations, prompts or code. They are kept {p0} days.",
        { p0: DIAGNOSTIC_RETENTION_DAYS },
      )}
    >
      <Stack>
        {/* One consent with three states, so one control: automatic sends crash reports (and the weekly log) without asking. */}
        <NavigationGroup>
          <SegmentedRow
            label={copy("Günlükleri paylaş", "Share logs")}
            help={options.map((option) => `${option.label}: ${option.detail}`).join(" ")}
            value={mode ?? "ask"}
            options={options.map(({ value, label }) => ({ value, label }))}
            onChange={choose}
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
          disabled={busy}
          onPress={() => void sendNow()}
        />
        {shown ? <Notice tone={shown.tone} message={shown.text} /> : null}
        <Button
          label={copy("Son çökme kaydını kopyala", "Copy last crash log")}
          tone="quiet"
          onPress={() => void copyCrash()}
        />
        {copied !== null ? (
          <Notice
            tone={copied ? "success" : "info"}
            message={copied ? copy("Çökme kaydı kopyalandı.", "Crash log copied.") : copy("Kayıtlı çökme yok.", "No crash recorded.")}
          />
        ) : null}
      </Stack>
    </HintSection>
  );
}
