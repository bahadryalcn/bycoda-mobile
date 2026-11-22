import { useAsyncAction } from "@/state/actions";
import { setStringAsync } from "expo-clipboard";
import { useLayoutEffect, useRef, useState } from "react";
import { Linking, View, type LayoutChangeEvent } from "react-native";
import { Body, Button, Disclosure, Heading, MutationState, Stack, NavigationGroup, NavigationRow } from "@/ui/primitives";
import ExternalLink from "lucide-react-native/icons/external-link";
import { useMobileTheme } from "@/ui/theme";
import { lineHeight, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import {
  legalAppendixTitle,
  legalSections,
  legalUpdatedDate,
  mitLicense,
  privacyPolicyUrl,
  repositoryUrl,
  supportEmail,
  websiteUrl,
  type LegalDocumentId,
} from "./legal-content";
import { HintSection } from "@/ui/info-hint";

export const legalSectionId = (index: number) => `section-${index}`;
export { legalDocumentTitle, isLegalDocument } from "./legal-content";
export type { LegalDocumentId } from "./legal-content";

/** Offline content that also works before the protected navigation tree mounts. */
export function LegalDocument({ document, sectionLayout }: {
  document: LegalDocumentId;
  /** Reader hook: reports each section wrapper's layout for in-page navigation. */
  sectionLayout?: (id: string) => (event: LayoutChangeEvent) => void;
}) {
  const copy = useCopy();
  const sections = legalSections[document].map((section, index) => {
    const paragraphs = <Stack style={{ gap: space.md }}>
      {section.paragraphs.map((paragraph, paragraphIndex) => (
        <Body key={paragraphIndex} selectable style={{ lineHeight: lineHeight.message }}>
          {copy(...paragraph)}
        </Body>
      ))}
    </Stack>;
    return document === "help"
      ? <Disclosure key={index} label={copy(...section.title)}>{paragraphs}</Disclosure>
      : <View key={index} onLayout={sectionLayout?.(legalSectionId(index))}>
        <Stack style={{ gap: space.md }}>
          <Heading>{copy(...section.title)}</Heading>
          {paragraphs}
        </Stack>
      </View>;
  });
  return (
    <Stack style={{ gap: space.xl }}>
      <Body muted>
        {copy("Son güncelleme: ", "Last updated: ")}
        {copy(...legalUpdatedDate)}
      </Body>
      {document === "help" ? <DocumentLinks key={document} document={document} /> : null}
      {document === "help" ? <NavigationGroup>{sections}</NavigationGroup> : sections}
      {document === "terms" ? (
        <View onLayout={sectionLayout?.("mit-license")}>
          <Stack style={{ gap: space.md }}>
            <Heading>{legalAppendixTitle("mit-license", copy)}</Heading>
            <Body selectable style={{ lineHeight: lineHeight.message }}>{mitLicense}</Body>
          </Stack>
        </View>
      ) : null}
      {document !== "help" ? (
        <View onLayout={sectionLayout?.("contact-links")}>
          <DocumentLinks key={document} document={document} />
        </View>
      ) : null}
    </Stack>
  );
}

function DocumentLinks({ document }: { document: LegalDocumentId }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const action = useAsyncAction();
  const clipboard = useAsyncAction();
  const mailUrl = `mailto:${supportEmail}`;
  const [target, setTarget] = useState<string | null>(null);
  const active = useRef(true);
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  function open(url: string) {
    if (!active.current) return;
    void action.run(async () => {
      if (!active.current) return;
      setTarget(url);
      clipboard.reset();
      try { await Linking.openURL(url); }
      catch {
        throw new Error(url === mailUrl
          ? copy("E-posta uygulaması açılamadı.", "The email app could not be opened.")
          : copy("Bağlantı açılamadı. İnternet bağlantını ve tarayıcını kontrol et.", "The link could not be opened. Check your internet connection and browser."));
      }
    });
  }
  function copyAddress() {
    if (!active.current) return;
    void clipboard.run(async () => {
      try {
        if (await setStringAsync(supportEmail)) return;
      } catch {
        // Present the same retry instruction whether the platform declines or throws.
      }
      throw new Error(copy("Kopyalanamadı. Yeniden deneyin.", "Could not copy. Try again."));
    });
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
              label: copy("bycoda web sitesi", "bycoda website"),
              url: websiteUrl,
            },
            {
              label: copy("GitHub projesi ve açık konular", "GitHub project & public issues"),
              url: repositoryUrl,
            },
          ];
  return (
    <HintSection title={legalAppendixTitle("contact-links", copy)} help={copy("Dokunduğun bağlantı başka bir uygulamada açılır.", "Links open in another app when you tap them.")}>
      <NavigationGroup>
        {[{ label: copy("E-posta uygulamasını aç", "Open email app"), url: mailUrl, detail: supportEmail }, ...links].map(({ label, url, ...rest }) => (
          <View key={url}>
            <NavigationRow label={label} intent="command" detail={"detail" in rest ? rest.detail : undefined} detailLines={0} trailing={<ExternalLink size={16} color={colors.muted} />}
              disabled={action.isPending} busy={action.isPending && target === url} onPress={() => open(url)} />
            {target === url ? <MutationState mutation={action} /> : null}
            {target === mailUrl && url === mailUrl && action.isError ? (
              <>
                <Button
                  label={clipboard.isSuccess
                    ? copy("Kopyalandı", "Copied")
                    : copy("Destek adresini kopyala", "Copy support address")}
                  tone="quiet"
                  reserveTouchTarget
                  busy={clipboard.isPending}
                  onPress={copyAddress}
                />
                <MutationState mutation={clipboard} />
              </>
            ) : null}
          </View>
        ))}
      </NavigationGroup>
    </HintSection>
  );
}
