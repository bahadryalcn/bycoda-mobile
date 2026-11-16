import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DIAGNOSTIC_RETENTION_DAYS } from "../account/contracts";
import { useAccount } from "../account/ui/account-context";
import { Button, Field, Notice, SelectRow, Stack } from "../../ui/primitives";
import { HintSection } from "../../ui/info-hint";
import { useCopy } from "../../ui/copy";
import { useDiagnosticResultText } from "./diagnostic-copy";
import { sendDiagnostics, useDiagnosticPrefs } from "./diagnostics-runtime";
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
    { value: "auto", label: copy("Otomatik gönder", "Send automatically"), detail: copy("Çökmeden sonra otomatik gönderilir, ayrıca haftada bir.", "After a crash they are sent automatically, and once a week.") },
  ];
  const choose = (value: DiagnosticMode) => {
    setResult(null);
    setMode(value).catch(() => setResult("save-failed"));
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
        {options.map((option) => (
          <SelectRow
            key={option.value}
            label={option.label}
            detail={option.detail}
            selected={(mode ?? "ask") === option.value}
            onPress={() => choose(option.value)}
          />
        ))}
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
      </Stack>
    </HintSection>
  );
}
