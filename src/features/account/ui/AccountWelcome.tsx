import { useState } from "react";
import { ScrollView } from "react-native";
import { LegalLinks } from "@/ui/brand";
import { Notice } from "@/ui/primitives";
import { OnboardingShell } from "@/ui/onboarding-shell";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { openSupportMail } from "../../settings/support-mail";
import type { LegalDocumentId } from "../../legal/legal-document";
import { LegalDocumentSheet } from "../../legal/legal-reader";
import { SignInPanel, type SignInStep } from "./SignInPanel";

/** Signed-out entry: full-screen pages show what bycoda does; sign-in and legal links stay at the bottom. */
export function AccountWelcome({ unavailable = false }: { unavailable?: boolean }) {
  const copy = useCopy();
  const [document, setDocument] = useState<LegalDocumentId | null>(null);
  // The e-mail code step needs the room next to the keyboard; the pages return on "Back".
  const [step, setStep] = useState<SignInStep>("choose");
  return <>
    <OnboardingShell hidePages={step === "code"} pages={[
      { key: "control", art: "guideWalk", title: copy("Ajanların cebinde", "Your agents, in your pocket"),
        body: copy("Bilgisayarındaki oturumları telefondan başlat ve izle.", "Start and follow the sessions on your computer from your phone.") },
      { key: "respond", art: "serene", lightArt: "wave", title: copy("Hiçbir soruyu bekletme", "Never keep a question waiting"),
        body: copy("Onaylar ve sorular anında telefonuna gelir.", "Approvals and questions reach your phone right away.") },
      { key: "secure", art: "guideFront", title: copy("Kodun bilgisayarında kalır", "Your code stays on your computer"),
        body: copy("Telefon yalnızca bağlı bilgisayarı yönetir.", "The phone only steers your paired computer.") },
    ]}>
      {/* Sized by the shell's panel (it shrinks for the keyboard and short screens), not by a window-height fraction. */}
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: space.md }}>
        {unavailable
          ? <Notice tone="warning"
              message={copy("Giriş şu an kullanılamıyor. Uygulamayı güncelle veya destek ekibine yaz.", "Sign-in is not available right now. Update the app or contact support.")}
              action={{ label: copy("Destekle iletişime geç", "Contact support"), onPress: () => openSupportMail(copy, "bycoda sign-in") }} />
          : <SignInPanel onStepChange={setStep} />}
      </ScrollView>
      <LegalLinks onOpen={setDocument} />
    </OnboardingShell>
    <LegalDocumentSheet document={document} onClose={() => setDocument(null)} />
  </>;
}
