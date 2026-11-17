import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Stack as RouterStack, useLocalSearchParams } from "expo-router";
import { useAccount } from "../account/ui/account-context";
import { Body, ChoiceChip, Field, FormActions, Notice, Row, Screen, SegmentedControl, Stack, StateView, ToggleField, showToast } from "../../ui/primitives";
import { useCopy } from "../../ui/copy";
import { useDiagnosticResultText } from "./diagnostic-copy";
import { clearCrashMarker, feedbackClient, feedbackContext, sendDiagnostics, useDiagnosticPrefs } from "./diagnostics-runtime";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MESSAGE_MAX,
  submitFeedback,
  type FeedbackKind,
  type FeedbackSubmitResult,
} from "./feedback-model";
import { useFeedbackDraft } from "./feedback-store";

/** In-app feedback; the same fields and flow as the desktop dialog. Reachable from Settings and the crash prompt. */
export function FeedbackScreen() {
  const copy = useCopy();
  const account = useAccount();
  const resultText = useDiagnosticResultText();
  const { crash } = useLocalSearchParams<{ crash?: string }>();
  const { draft, attachTouched, patch, clearIfCurrent } = useFeedbackDraft();
  const mode = useDiagnosticPrefs((state) => state.consent.mode);
  const hydrate = useDiagnosticPrefs((state) => state.hydrate);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  // Delivery can outlive this screen; it must not replace a reopened draft.
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [result, setResult] = useState<FeedbackSubmitResult | null>(null);
  const fromCrash = crash === "1";

  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  // Opened from the crash prompt: a problem report with the crash logs attached.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (fromCrash) patch({ kind: "problem", attachLogs: true });
  }, [fromCrash, patch]);
  // Logs start ticked only in automatic mode; once the user touches the switch their choice sticks.
  const attachLogs = attachTouched || fromCrash ? draft.attachLogs : mode === "auto";

  const kindLabels: Record<FeedbackKind, string> = {
    idea: copy("Fikir", "Idea"),
    problem: copy("Sorun", "Problem"),
    praise: copy("Övgü", "Praise"),
    other: copy("Diğer", "Other"),
  };
  const placeholders: Record<FeedbackKind, string> = {
    idea: copy("bycoda'yı senin için ne daha iyi yapar? Fikri ve nasıl yardımcı olacağını anlat.", "What would make bycoda better for you? Describe the idea and why it would help."),
    problem: copy("Ne ters gitti? Ne yaptığını, ne beklediğini ve ne olduğunu anlat.", "What went wrong? Tell us what you did, what you expected and what happened."),
    praise: copy("En çok neyi beğeniyorsun? Neyin iyi çalıştığını anlat.", "What do you enjoy most? Tell us what is working well for you."),
    other: copy("Aklında başka bir şey mi var? Her mesajı okuyoruz.", "Anything else on your mind? We read every message."),
  };
  const length = draft.message.trim().length;
  const issue = result?.status === "invalid" ? result.issues[0] : undefined;
  const error =
    issue === "message-missing"
      ? copy("Bir mesaj ekle.", "Add a message.")
      : issue === "message-long"
        ? copy("En fazla {p0} karakter kullan.", "Use at most {p0} characters.", { p0: FEEDBACK_MESSAGE_MAX })
        : undefined;

  const send = async () => {
    if (pending.current || !mounted.current) return;
    pending.current = true;
    const submitted = draft;
    setBusy(true);
    const { signedIn, client } = feedbackClient(account);
    try {
      const outcome = await submitFeedback(client, { ...draft, attachLogs }, signedIn, {
        context: feedbackContext,
        sendLogs: async ({ feedbackId, note }) => {
          const logs = await sendDiagnostics(account, "feedback", { feedbackId, note, includeCrash: fromCrash });
          if (logs === "sent" && fromCrash) clearCrashMarker();
          return logs;
        },
      });
      if (outcome.status === "sent") {
        const cleared = clearIfCurrent(submitted);
        if (!mounted.current) return;
        setResult(cleared ? outcome : null);
        showToast({ tone: "success", message: copy("Geri bildirimin için teşekkürler!", "Thank you for your feedback!") });
      } else if (mounted.current && useFeedbackDraft.getState().draft === submitted) setResult(outcome);
    } catch {
      if (mounted.current && useFeedbackDraft.getState().draft === submitted) setResult({ status: "failed" });
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const sent = result?.status === "sent" ? result : null;
  return (
    <Screen
      footer={
        sent ? undefined : (
          <FormActions submitLabel={copy("Gönder", "Send")} busy={busy} disabled={length === 0} onSubmit={() => void send()} />
        )
      }
    >
      <RouterStack.Screen options={{ title: copy("Geri bildirim gönder", "Send feedback") }} />
      {sent ? (
        <Stack>
          <StateView
            illustration="success"
            title={copy("Geri bildirimin için teşekkürler!", "Thank you for your feedback!")}
            description={copy("Referans: {p0}", "Reference: {p0}", { p0: sent.reference })}
          />
          {sent.logs && sent.logs !== "sent" ? (
            <Notice
              tone="warning"
              message={copy("Geri bildirimin gönderildi ama günlükler gönderilmedi. {p0}", "Your feedback was sent, but the logs were not. {p0}", { p0: resultText(sent.logs) })}
            />
          ) : null}
        </Stack>
      ) : (
        <Stack>
          <SegmentedControl
            label={copy("Geri bildirim türü", "Kind of feedback")}
            value={draft.kind}
            options={FEEDBACK_KINDS.map((value) => ({ value, label: kindLabels[value] }))}
            onChange={(kind) => patch({ kind })}
          />
          <Field
            label={copy("Mesaj", "Message")}
            multiline
            placeholder={placeholders[draft.kind]}
            value={draft.message}
            error={error}
            info={copy("Gizli bilgileri yapıştırma.", "Do not paste secrets.")}
            hint={`${length}/${FEEDBACK_MESSAGE_MAX}`}
            onChangeText={(message) => patch({ message })}
          />
          <Body>{copy("Deneyimin nasıl? (isteğe bağlı)", "How is your experience? (optional)")}</Body>
          <Row>
            {[1, 2, 3, 4, 5].map((n) => (
              <ChoiceChip
                key={n}
                label={String(n)}
                accessibilityLabel={copy("{p0} / 5", "{p0} of 5", { p0: n })}
                selected={draft.rating === n}
                onPress={() => patch({ rating: draft.rating === n ? null : n })}
              />
            ))}
          </Row>
          <ToggleField
            label={copy("Uygulama sürümünü ve sistemi ekle", "Include app version and system")}
            help={copy("Uygulama sürümü, platform, işletim sistemi sürümü ve yayın kanalı.", "App version, platform, OS version and release channel.")}
            value={draft.includeContext}
            onChange={(includeContext) => patch({ includeContext })}
          />
          <ToggleField
            label={copy("Tanılama günlüklerini ekle", "Attach diagnostic logs")}
            help={copy("Gizli bilgileri çıkarılmış uygulama günlükleri nedeni bulmamıza yardım eder. Konuşmalarını asla içermez.", "Redacted app logs help us find the cause. They never include your conversations.")}
            value={attachLogs}
            onChange={(value) => patch({ attachLogs: value })}
          />
          {result?.status === "rate-limited" ? (
            <Notice tone="danger" message={copy("Çok fazla istek. Biraz bekleyip tekrar dene; mesajın korunuyor.", "Too many requests. Wait a little and try again; your message is kept.")} />
          ) : null}
          {result?.status === "failed" ? (
            <Notice tone="danger" message={copy("Geri bildirimin gönderilemedi. Mesajın korunuyor.", "Could not send your feedback. Your message is kept.")} />
          ) : null}
          {result?.status === "not-configured" ? (
            <Notice tone="info" message={copy("Uygulamadan geri bildirim göndermek bu derlemede kullanılamıyor.", "Sending feedback from the app is not available in this build.")} />
          ) : null}
        </Stack>
      )}
    </Screen>
  );
}
