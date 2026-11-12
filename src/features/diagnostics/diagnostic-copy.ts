import { useCopy } from "../../ui/copy";
import type { DiagnosticSendResult } from "./diagnostic-report";

/** The one user-facing sentence per send result, shared by every surface (same wording as desktop). */
export function useDiagnosticResultText() {
  const copy = useCopy();
  return (result: DiagnosticSendResult): string => {
    switch (result) {
      case "sent":
        return copy("Tanılama günlükleri gönderildi. Teşekkürler.", "Diagnostic logs sent. Thank you.");
      case "rate-limited":
        return copy("Çok fazla rapor. Biraz bekleyip tekrar dene.", "Too many reports. Wait a little and try again.");
      case "not-configured":
        return copy("Tanılama günlüklerini göndermek bu derlemede kullanılamıyor.", "Sending diagnostic logs is not available in this build.");
      case "empty":
        return copy("Gönderilecek günlük yoktu.", "There were no logs to send.");
      case "failed":
        return copy("Tanılama günlükleri gönderilemedi.", "Could not send the diagnostic logs.");
    }
  };
}
