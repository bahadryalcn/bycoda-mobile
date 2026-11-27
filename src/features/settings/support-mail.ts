import { Linking } from "react-native";
import { setStringAsync } from "expo-clipboard";
import { showToast } from "@/ui/toast";
import { supportEmail } from "../legal/legal-content";

type Copy = (tr: string, en: string) => string;

/** Copies the support address and reports the result; the fallback when no mail app opens. */
async function copySupportAddress(copy: Copy) {
  let copied = false;
  try {
    copied = await setStringAsync(supportEmail);
  } catch {
    // Same message whether the platform declines or throws.
  }
  showToast(copied
    ? { message: copy("Destek adresi kopyalandı.", "Support address copied.") }
    : { tone: "danger", message: copy("Kopyalanamadı. Yeniden deneyin.", "Could not copy. Try again.") });
}

/**
 * "Contact by e-mail": opens the mail app; when none opens, says so and offers to copy the address,
 * like the legal documents' contact link, so the tap never does nothing.
 */
export function openSupportMail(copy: Copy, subject?: string) {
  const url = `mailto:${supportEmail}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
  void Linking.openURL(url).catch(() => {
    showToast({
      tone: "warning",
      message: copy("E-posta uygulaması açılamadı.", "The email app could not be opened."),
      action: { label: copy("Destek adresini kopyala", "Copy support address"), onPress: () => { void copySupportAddress(copy); } },
    });
  });
}
