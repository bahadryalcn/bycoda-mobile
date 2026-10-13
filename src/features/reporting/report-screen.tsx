import { useState } from "react";
import { Linking } from "react-native";
import { Stack as RouterStack, router } from "expo-router";
import { assertAppAccess } from "@/state/security";
import { useCopy } from "@/ui/copy";
import {
  Body,
  Button,
  Card,
  ChoiceChip,
  ErrorText,
  Field,
  Row,
  Screen,
  Section,
  ToggleField,
  Disclosure,
  Sheet,
  ConfirmationCard,
} from "@/ui/primitives";
import { supportEmail } from "../legal/legal-content";
import {
  maxReportDescription,
  maxReportExcerpt,
  reportDraftError,
  reportReasons,
} from "./report-model";
import {
  discardContentReport,
  openContentReportEmail,
  updateContentReport,
  useContentReport,
} from "./report-store";

export function ContentReportScreen() {
  const copy = useCopy();
  const { draft, status, error } = useContentReport();
  const [discarding, setDiscarding] = useState(false);
  const busy = status === "opening";
  const validation = reportDraftError(draft);
  const visibleError = error ?? ((draft.description.length > 0 || draft.consent) ? validation : null);
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
      "E-posta taslağına hangi bilgilerin ekleneceğini onayla.",
      "Confirm which information will be added to the email draft.",
    ),
    recipient: copy(
      "Destek e-posta adresi kullanılamıyor.",
      "The support email address is unavailable.",
    ),
    open: copy(
      "E-posta uygulaması açılamadı. Destek adresini kopyalayabilirsin; taslağın bu uygulama açıkken korunur.",
      "The email app could not be opened. You can copy the support address; your draft is kept while this app remains running.",
    ),
  };
  return (
    <Screen>
      <RouterStack.Screen options={{ title: copy("İçerik bildir", "Report content") }} />
      <Section title={copy("Bildirim nedeni", "Report reason")}>
        <Row>
          {reportReasons.map((reason) => (
            <ChoiceChip
              key={reason}
              label={reasonLabels[reason]}
              selected={draft.reason === reason}
              disabled={busy}
              onPress={() => updateContentReport({ reason })}
            />
          ))}
        </Row>
      </Section>
      <Card>
        <Field
          label={copy("Açıklama", "Description")}
          value={draft.description}
          multiline
          editable={!busy}
          onChangeText={(description) => updateContentReport({ description })}
        />
        <Body muted>
          {Array.from(draft.description).length} / {maxReportDescription}
        </Body>
        <ToggleField
          label={copy("İçerikten alıntı ekle", "Include a content excerpt")}
          value={draft.includeExcerpt}
          disabled={busy}
          onChange={(includeExcerpt) => updateContentReport({ includeExcerpt, consent: false })}
        />
        {draft.includeExcerpt ? (
          <>
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
            <Body muted>
              {Array.from(draft.excerpt).length} / {maxReportExcerpt}
            </Body>
          </>
        ) : null}
      <Disclosure label={copy("Bildirim ve gizlilik", "Reporting & privacy")}>
        <Body>
          {copy(
            "Bildirimi destek e-postası olarak hazırlayabilirsin. E-posta uygulamanda alıcıyı ve içeriği kontrol edip kendin gönder. bycoda otomatik mesaj veya günlük göndermez.",
            "Prepare a report as a support email. Review its recipient and content in your email app and send it yourself. bycoda does not automatically send messages or logs.",
          )}
        </Body>
        <Body selectable>{supportEmail}</Body>
        <Body muted>
          {copy(
            "Erişim anahtarlarını, eşleştirme kodlarını, özel proje dosyalarını veya kişisel bilgileri ekleme. Bu taslak yalnızca bellekte tutulur; uygulama sonlandırılırsa kaybolur.",
            "Remove access keys, pairing codes, private project files and personal information. This draft is kept only in memory and is lost if the app process ends.",
          )}
        </Body>
        <Button
          label={copy("Gizlilik politikası", "Privacy policy")}
          onPress={() => router.push("/legal/privacy")}
        />
      </Disclosure>
        <ToggleField
          label={copy(
            "Yukarıda seçtiğim bilgilerin destek e-posta taslağına eklenmesini onaylıyorum.",
            "I agree to add the information I selected above to the support email draft.",
          )}
          value={draft.consent}
          disabled={busy}
          onChange={(consent) => updateContentReport({ consent })}
        />
        <ErrorText error={visibleError} message={visibleError ? errorLabels[visibleError] : undefined} />
        {status === "opened" ? (
          <Body accessibilityLiveRegion="polite">
            {copy(
              "E-posta uygulaması açıldı; bildirimi orada inceleyip gönder. bycoda gönderildiğini veya teslim edildiğini doğrulamaz.",
              "The email app opened; review and send your report there. bycoda cannot confirm sending or delivery.",
            )}
          </Body>
        ) : null}
        <Button
          label={copy("E-posta ile bildir", "Report by email")}
          tone="primary"
          busy={busy}
          disabled={!!reportDraftError(draft)}
          onPress={() => {
            void openContentReportEmail({
              recipient: supportEmail,
              turkish: copy("tr", "en") === "tr",
              assertAccess: assertAppAccess,
              openURL: (url) => Linking.openURL(url),
            }).catch(() => {});
          }}
        />
        <Button label={copy("Taslağı sil", "Discard draft")} tone="quiet" disabled={busy} onPress={() => setDiscarding(true)} />
        <Sheet visible={discarding} size="compact" title={copy("Taslağı sil", "Discard draft")} onClose={() => setDiscarding(false)}>
          <ConfirmationCard message={copy("Bu bildirim taslağı silinsin mi?", "Discard this report draft?")} cancelLabel={copy("Taslağı koru", "Keep draft")} confirmLabel={copy("Taslağı sil", "Discard draft")} onCancel={() => setDiscarding(false)} onConfirm={() => { discardContentReport(); setDiscarding(false); }} />
        </Sheet>
      </Card>
    </Screen>
  );
}
