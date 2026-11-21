import { useEffect, useLayoutEffect, useRef } from "react";
import { Stack as RouterStack, router, useLocalSearchParams } from "expo-router";
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
} from "./feedback-model";
import { useFeedbackDraft } from "./feedback-store";

/** In-app feedback; the same fields and flow as the desktop dialog. Reachable from Settings and the crash prompt. */
export function FeedbackScreen() {
  const copy = useCopy();
  const account = useAccount();
  const resultText = useDiagnosticResultText();
  const { crash } = useLocalSearchParams<{ crash?: string }>();
  const { draft, attachTouched, pending, result, patch, clear, beginDelivery, finishDelivery } = useFeedbackDraft();
  const mode = useDiagnosticPrefs((state) => state.consent.mode);
  const hydrate = useDiagnosticPrefs((state) => state.hydrate);
  const busy = pending !== null;
  const mounted = useRef(true);
  // Delivery can outlive this screen; it must not replace a reopened draft.
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const fromCrash = crash === "1";

  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  // Opened from the crash prompt: a problem report with the crash logs attached.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const feedback = useFeedbackDraft.getState();
    if (fromCrash && !feedback.pending && feedback.result?.status !== "sent") patch({ kind: "problem", attachLogs: true });
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
  const issue = length > FEEDBACK_MESSAGE_MAX
    ? "message-long"
    : result?.status === "invalid" ? result.issues[0] : undefined;
  const error =
    issue === "message-missing"
      ? copy("Bir mesaj ekle.", "Add a message.")
      : issue === "message-long"
        ? copy("En fazla {p0} karakter kullan.", "Use at most {p0} characters.", { p0: FEEDBACK_MESSAGE_MAX })
        : undefined;

  const send = async () => {
    const submitted = draft;
    if (!mounted.current || !beginDelivery(submitted)) return;
    try {
      const { signedIn, client } = feedbackClient(account);
      const outcome = await submitFeedback(client, { ...draft, attachLogs }, signedIn, {
        context: feedbackContext,
        sendLogs: async ({ feedbackId, note }) => {
          const logs = await sendDiagnostics(account, "feedback", { feedbackId, note, includeCrash: fromCrash });
          if (logs === "sent" && fromCrash) clearCrashMarker();
          return logs;
        },
      });
      const recorded = finishDelivery(submitted, outcome);
      if (outcome.status === "sent" && !recorded && mounted.current) {
        showToast({ tone: "success", message: copy("Geri bildirimin için teşekkürler!", "Thank you for your feedback!") });
      }
    } catch {
      finishDelivery(submitted, { status: "failed" });
    }
  };

  const sent = result?.status === "sent" ? result : null;
  const failed = result?.status === "failed" || result?.status === "rate-limited";
  const deliveryMessage = result?.status === "rate-limited"
    ? copy("Çok fazla istek. Biraz bekleyip tekrar dene; mesajın korunuyor.", "Too many requests. Wait a little and try again; your message is kept.")
    : result?.status === "failed"
      ? copy("Geri bildirimin gönderilemedi. Mesajın korunuyor.", "Could not send your feedback. Your message is kept.")
      : undefined;
  return (
    <Screen
      footer={
        sent ? (
          <FormActions
            submitLabel={copy("Tamam", "Done")}
            onSubmit={() => {
              clear();
              if (router.canGoBack()) router.back(); else router.replace("/settings");
            }}
          />
        ) : (
          <FormActions
            submitLabel={failed ? copy("Yeniden dene", "Retry") : copy("Gönder", "Send")}
            busy={busy}
            disabled={length === 0 || length > FEEDBACK_MESSAGE_MAX}
            feedback={!busy && deliveryMessage ? <Notice tone="danger" message={deliveryMessage} /> : null}
            onSubmit={() => void send()}
          />
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
            disabled={busy}
            options={FEEDBACK_KINDS.map((value) => ({ value, label: kindLabels[value] }))}
            onChange={(kind) => patch({ kind })}
          />
          <Field
            label={copy("Mesaj", "Message")}
            multiline
            placeholder={placeholders[draft.kind]}
            value={draft.message}
            editable={!busy}
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
                disabled={busy}
                onPress={() => patch({ rating: draft.rating === n ? null : n })}
              />
            ))}
          </Row>
          <ToggleField
            label={copy("Uygulama sürümünü ve sistemi ekle", "Include app version and system")}
            help={copy("Uygulama sürümü, platform, işletim sistemi sürümü ve yayın kanalı.", "App version, platform, OS version and release channel.")}
            value={draft.includeContext}
            disabled={busy}
            onChange={(includeContext) => patch({ includeContext })}
          />
          <ToggleField
            label={copy("Tanılama günlüklerini ekle", "Attach diagnostic logs")}
            help={copy("Gizli bilgileri çıkarılmış uygulama günlükleri nedeni bulmamıza yardım eder. Konuşmalarını asla içermez.", "Redacted app logs help us find the cause. They never include your conversations.")}
            value={attachLogs}
            disabled={busy}
            onChange={(value) => patch({ attachLogs: value })}
          />
          {result?.status === "not-configured" ? (
            <Notice tone="info" message={copy("Uygulamadan geri bildirim göndermek bu derlemede kullanılamıyor.", "Sending feedback from the app is not available in this build.")} />
          ) : null}
        </Stack>
      )}
    </Screen>
  );
}
