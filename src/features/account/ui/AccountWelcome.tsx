import { useState } from "react";
import { View } from "react-native";
import { BrandLogo, LegalLinks } from "@/ui/brand";
import { Body, Heading, Screen, Sheet, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { LegalDocument, legalDocumentTitle, type LegalDocumentId } from "../../legal/legal-document";
import { SignInPanel } from "./SignInPanel";

/** Compact, scrollable entry with legal information available before navigation mounts. */
export function AccountWelcome({ unavailable = false }: { unavailable?: boolean }) {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const [document, setDocument] = useState<LegalDocumentId | null>(null);
  return <Screen title={copy("Hesap", "Account")}>
    <Stack style={{ gap: space.xxl }}>
      <View style={{ gap: space.xl, paddingTop: space.xl }}>
        <BrandLogo />
        <Stack style={{ gap: space.sm }}>
          <Heading style={uiStyles.pageTitle}>{copy("Hesabınla devam et", "Continue with your account")}</Heading>
          <Body muted>{unavailable
            ? copy("Bu sürümde hesap girişi ayarlanmamış. Devam etmek için giriş desteği olan bir sürüm kullan.", "Account sign-in is not configured in this build. Use a build with sign-in enabled to continue.")
            : copy("Bilgisayarlarına ve oturumlarına güvenle bağlanmak için giriş yap.", "Sign in to securely connect to your computers and sessions.")}</Body>
        </Stack>
      </View>
      {!unavailable ? <SignInPanel /> : null}
      <LegalLinks onOpen={setDocument} />
    </Stack>
    {document ? <Sheet visible title={legalDocumentTitle(document, copy)} onClose={() => setDocument(null)}>
      <LegalDocument document={document} />
    </Sheet> : null}
  </Screen>;
}
