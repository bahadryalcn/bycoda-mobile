import { useState } from "react";
import { Linking } from "react-native";
import { Body, Button, Card, ErrorText, Heading, Section, Stack, NavigationGroup, NavigationRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import {
  legalSections,
  legalUpdatedDate,
  mitLicense,
  privacyPolicyUrl,
  repositoryUrl,
  supportEmail,
  type LegalDocumentId,
} from "./legal-content";

export { legalDocumentTitle, isLegalDocument } from "./legal-content";
export type { LegalDocumentId } from "./legal-content";

/** Offline content that also works before the protected navigation tree mounts. */
export function LegalDocument({ document }: { document: LegalDocumentId }) {
  const copy = useCopy();
  return (
    <Stack>
      <Body muted>
        {copy("Son güncelleme: ", "Last updated: ")}
        {copy(...legalUpdatedDate)}
      </Body>
      {legalSections[document].map((section, index) => (
        <Section key={index} title={copy(...section.title)}>
          {section.paragraphs.map((paragraph, paragraphIndex) => (
            <Body key={paragraphIndex}>{copy(...paragraph)}</Body>
          ))}
        </Section>
      ))}
      {document === "terms" ? (
        <Section title={copy("MIT lisansı", "MIT license")}>
          <Body>{mitLicense}</Body>
        </Section>
      ) : null}
      <DocumentLinks key={document} document={document} />
    </Stack>
  );
}

function DocumentLinks({ document }: { document: LegalDocumentId }) {
  const copy = useCopy();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function open(url: string) {
    if (opening) return;
    setError(null);
    setOpening(url);
    try {
      await Linking.openURL(url);
    } catch {
      setError(
        copy(
          "Bağlantı açılamadı. Tarayıcını veya e-posta uygulamanı kontrol et; ekrandaki destek adresini kopyalayabilirsin.",
          "The link could not be opened. Check your browser or email app; you can copy the support address shown here.",
        ),
      );
    } finally {
      setOpening(null);
    }
  }
  const links =
    document === "privacy"
      ? [
          {
            label: copy("Depodaki gizlilik politikası", "Privacy policy in the repository"),
            url: privacyPolicyUrl,
          },
          {
            label: copy("OpenAI gizlilik politikası", "OpenAI privacy policy"),
            url: "https://openai.com/policies/privacy-policy/",
          },
          {
            label: copy("Anthropic gizlilik politikası", "Anthropic privacy policy"),
            url: "https://www.anthropic.com/legal/privacy",
          },
          {
            label: copy("Google gizlilik politikası", "Google privacy policy"),
            url: "https://policies.google.com/privacy",
          },
          {
            label: copy("GitHub gizlilik bildirimi", "GitHub privacy statement"),
            url: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement",
          },
          {
            label: copy("Google hesap izinleri", "Google account permissions"),
            url: "https://security.google.com/settings/security/permissions",
          },
          {
            label: copy("YouTube hizmet şartları", "YouTube terms of service"),
            url: "https://www.youtube.com/t/terms",
          },
        ]
      : document === "terms"
        ? [
            {
              label: copy("YouTube hizmet şartları", "YouTube terms of service"),
              url: "https://www.youtube.com/t/terms",
            },
            {
              label: copy("Kaynak kodu ve lisans", "Source code & license"),
              url: repositoryUrl,
            },
          ]
        : [
            {
              label: copy("GitHub projesi ve açık konular", "GitHub project & public issues"),
              url: repositoryUrl,
            },
          ];
  return (
    <Section title={copy("İletişim ve bağlantılar", "Contact & links")}>
      <Card>
        <Body muted>
          {copy(
            "Dokunduğun bağlantı başka bir uygulamada açılır.",
            "Links open in another app when you tap them.",
          )}
        </Body>
        <Body>{supportEmail}</Body>
        <Button
          label={copy("E-posta uygulamasını aç", "Open email app")}
          busy={opening === `mailto:${supportEmail}`}
          disabled={opening !== null}
          onPress={() => {
            void open(`mailto:${supportEmail}`);
          }}
        />
        <NavigationGroup>{links.map(({ label, url }) => (
          <NavigationRow
            key={url}
            label={label}
            disabled={opening !== null}
            onPress={() => {
              void open(url);
            }}
          />
        ))}</NavigationGroup>
        <ErrorText error={error} />
      </Card>
    </Section>
  );
}
