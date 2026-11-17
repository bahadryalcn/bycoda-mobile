import { useMobileTheme } from "@/ui/theme";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import { randomUUID } from "expo-crypto";
import { reportSender } from "./report-config";
import { Stack as RouterStack, router } from "expo-router";
import { assertAppAccess } from "@/state/security";
import { useCopy } from "@/ui/copy";
import { useInfoHint } from "@/ui/info-hint";
import { ConsentField } from "@/ui/consent-field";
import Animated from "react-native-reanimated";
import Flag from "lucide-react-native/icons/flag";
import { Body, Disclosure, ErrorText, Field, NavigationGroup, NavigationRow, Screen, Section, SelectField, Sheet, FormActions, Notice, ToggleField, useSuccessToast } from "@/ui/primitives";
import { IconTile } from "@/ui/icon-tile";
import { enterItem } from "@/ui/motion";
import { space } from "@/ui/tokens";
import {
  maxReportDescription,
  maxReportExcerpt,
  reportDraftError,
  reportReasons,
} from "./report-model";
import {
  discardReviewedContentReport,
  isContentReportReviewCurrent,
  type ReportReview,
  sendContentReport,
  updateContentReport,
  useContentReport,
} from "./report-store";

function tile(Glyph: typeof Flag, color: string) {
  return (
    <IconTile color={color}>
      <Glyph size={18} strokeWidth={2} color={color} />
    </IconTile>
  );
}

export function ContentReportScreen() {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const privacyInfo = useInfoHint(copy(
    "Yalnızca açıklaman ve eklemeyi seçtiğin alıntı incelenmek üzere bycoda’ya gönderilir. Bu taslak yalnızca bellekte tutulur; uygulama sonlandırılırsa kaybolur.",
    "Only your description and any excerpt you choose are sent to bycoda for review. This draft is kept only in memory and is lost if the app process ends.",
  ));
  const warning = copy(
    "Erişim anahtarı, eşleştirme kodu, özel dosya veya kişisel bilgi ekleme.",
    "Do not add access keys, pairing codes, private files or personal information.",
  );
  const { draft, status, error, receiptId, requestId, revision } = useContentReport();
  const [discarding, setDiscarding] = useState<ReportReview | null>(null);
  const active = useRef(true);
  const reviewOwner = useRef<ReportReview | null>(null);
  const retired = useRef(false);
  const toastSuccess = useSuccessToast();
  // Announce the delivery once, when it happens while this screen is mounted.
  const announced = useRef(status);
  useEffect(() => {
    if (announced.current !== status && status === "sent") toastSuccess(copy("Bildirim alındı.", "Report received."));
    announced.current = status;
  }, [status, toastSuccess, copy]);
  const reviewCurrent = !discarding || isContentReportReviewCurrent(discarding);
  useLayoutEffect(() => { if (discarding && !reviewCurrent) retired.current = true; }, [discarding, reviewCurrent]);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; reviewOwner.current = null; }; }, []);
  const closeReview = () => { reviewOwner.current = null; retired.current = true; setDiscarding(null); };
  const staleReview = !!discarding && (!reviewCurrent || retired.current);
  const busy = status === "sending";
  const validation = reportDraftError(draft);
  const visibleError = status === "sent" ? null : error ?? (draft.consent ? validation : null);
  const reasonLabels = {
    unsafe: copy("Zararlı veya tehlikeli içerik", "Unsafe or dangerous content"),
    hate: copy("Nefret veya taciz", "Hate or harassment"),
    sexual: copy("Cinsel içerik", "Sexual content"),
    privacy: copy("Gizlilik veya kişisel veri", "Privacy or personal data"),
    other: copy("Diğer", "Other"),
  };
  const errorLabels = {
    description: copy(
      "Bir açıklama yaz ve metin sınırlarını kontrol et.",
      "Write a description and check the text limits.",
    ),
    consent: copy(
      "Gönderilecek bilgileri onayla.",
      "Confirm the information to send.",
    ),
    service: copy(
      "Bildirim hizmeti henüz kullanılamıyor. Taslağın uygulama açıkken korunur.",
      "Reporting is not available yet. Your draft is kept while this app remains running.",
    ),
    send: copy(
      "Teslim doğrulanamadı. Taslağın korundu; yeniden deneyebilirsin.",
      "Delivery could not be confirmed. Your draft is kept; you can retry.",
    ),
  };
  return (
    <Screen footer={<FormActions
      submitLabel={status === "sent" ? copy("Gönderildi", "Sent") : copy("Gönder", "Send")}
      disabled={!reportSender || status === "sent" || !!validation} busy={busy}
      feedback={visibleError === "send" ? <Notice tone="danger" message={errorLabels.send} /> : status === "sent" && receiptId ? <Body selectable muted>{receiptId}</Body> : null}
      onSubmit={() => { if (!active.current || busy) return; void sendContentReport({ review: { draft, status, requestId, receiptId, revision }, sender: reportSender, newRequestId: randomUUID, assertAccess: assertAppAccess }).catch(() => {}); }}
      cancelLabel={copy("Taslağı sil", "Discard draft")} cancelDisabled={busy}
      onCancel={() => {
        if (busy || !active.current) return;
        const review = { draft, status, requestId, receiptId, revision };
        retired.current = false; reviewOwner.current = review; setDiscarding(review);
      }}
    />}>
      <RouterStack.Screen options={{ title: copy("İçerik bildir", "Report content") }} />
      {!reportSender || error === "service" ? <Notice tone="info" message={errorLabels.service} /> : null}
      <Section title={copy("Neden", "Reason")}>
      <Animated.View entering={enterItem(0)}>
        <NavigationGroup>
          <SelectField
            variant="row"
            icon={tile(Flag, colors.danger)}
            label={copy("Bildirim nedeni", "Report reason")}
            value={draft.reason}
            disabled={busy}
            options={reportReasons.map((reason) => ({ value: reason, label: reasonLabels[reason] }))}
            onChange={(reason) => updateContentReport({ reason })}
          />
        </NavigationGroup>
      </Animated.View>
      <Animated.View entering={enterItem(1)}>
        <View style={{ gap: space.sm }}>
          <Field
            label={copy("Açıklama", "Description")}
            error={visibleError === "description" ? errorLabels.description : undefined}
            value={draft.description}
            multiline
            editable={!busy}
            onChangeText={(description) => updateContentReport({ description })}
          />
          <Body muted style={uiStyles.caption}>
            {Array.from(draft.description).length} / {maxReportDescription}
          </Body>
        </View>
      </Animated.View>
      </Section>
      <Section title={copy("Alıntı", "Excerpt")}>
      <NavigationGroup>
        <ToggleField
          label={copy("İçerikten alıntı ekle", "Include a content excerpt")}
          value={draft.includeExcerpt}
          disabled={busy}
          onChange={(includeExcerpt) => updateContentReport({ includeExcerpt, consent: false })}
        />
      </NavigationGroup>
      {draft.includeExcerpt ? (
        <View style={{ gap: space.sm }}>
          <Field
            label={copy(
              "Paylaşılacak alıntı — göndermeden önce düzenle",
              "Excerpt to share — edit before sending",
            )}
            value={draft.excerpt}
            multiline
            editable={!busy}
            onChangeText={(excerpt) => updateContentReport({ excerpt, consent: false })}
          />
          <Body muted style={uiStyles.caption}>
            {Array.from(draft.excerpt).length} / {maxReportExcerpt}
          </Body>
        </View>
      ) : null}
      </Section>
      <Section title={copy("Onay", "Consent")}>
      <ConsentField label={copy("Gönderim onayı", "Consent to send")}
        detail={copy(
          "Seçtiğim bilgilerin incelenmek üzere bycoda’ya gönderilmesini onaylıyorum.",
          "I agree to send the selected information to bycoda for review.",
        )}
        value={draft.consent} disabled={busy}
        onChange={(consent) => updateContentReport({ consent })} />
      <ErrorText error={visibleError === "consent"} message={errorLabels.consent} />
      </Section>
      <Body muted>{warning}</Body>
      <Disclosure label={copy("Bildirim ve gizlilik", "Reporting & privacy")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Gizlilik politikası", "Privacy policy")}
            trailing={privacyInfo.button}
            onPress={() => router.push("/legal/privacy")}
          />
        </NavigationGroup>
        {privacyInfo.panel}
      </Disclosure>
      <Sheet visible={!!discarding} size="compact" title={copy("Taslağı sil", "Discard draft")} onClose={closeReview}>
        <Body>{copy("Bu bildirim taslağı silinsin mi?", "Discard this report draft?")}</Body>
        {staleReview ? <Notice tone="warning" message={copy("Taslak değişti. Silmeden önce yeniden incele.", "The draft changed. Review it again before discarding.")} /> : null}
        <FormActions submitLabel={copy("Taslağı sil", "Discard draft")} tone="danger" disabled={busy || staleReview}
          cancelLabel={copy("Taslağı koru", "Keep draft")} onCancel={closeReview}
          onSubmit={() => {
            if (!discarding || reviewOwner.current !== discarding || retired.current) return;
            try { assertAppAccess(); } catch { return; }
            if (discardReviewedContentReport(discarding)) closeReview();
          }} />
      </Sheet>
    </Screen>
  );
}
