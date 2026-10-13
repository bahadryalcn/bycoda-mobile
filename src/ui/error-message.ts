import { RemoteHostError } from "../remote/host-error";

type ErrorCopy = (turkish: string, english: string) => string;

export function remoteErrorKind(error: unknown) {
  return error instanceof RemoteHostError ? error.kind : undefined;
}

function remoteMessage(error: RemoteHostError, copy: ErrorCopy): string {
  switch (error.kind) {
    case "network":
      return error.uncertain
        ? copy("Bilgisayara ulaşılamadı.", "The computer could not be reached.")
        : copy(
            "Bilgisayara ulaşılamadı. Bağlantıyı kontrol edip yeniden dene.",
            "The computer could not be reached. Check the connection and retry.",
          );
    case "timeout":
      return copy(
        "Bilgisayarın yanıt vermesi çok uzun sürdü. Sonucu kontrol etmek için yenile.",
        "The computer took too long to respond. Refresh to check the result.",
      );
    case "aborted":
      return copy("İstek iptal edildi.", "Request cancelled.");
    case "unsupported":
      return copy(
        "Bu özellik için bilgisayarındaki Bycoda’yı güncelle.",
        "Update Bycoda on your computer to use this feature.",
      );
    case "identity":
      return error.message === "Connect this computer before sending requests."
        ? copy(
            "İstek göndermeden önce bu bilgisayarı bağla.",
            "Connect this computer before sending requests.",
          )
        : copy(
            "Bu adresteki bilgisayar değişmiş. Doğru bilgisayarı yeniden bağla.",
            "The computer at this address has changed. Connect the correct computer again.",
          );
    case "auth":
      if (error.message === "Unlock the app before connecting to this computer.")
        return copy("Bağlanmak için Bycoda’nın kilidini aç.", "Unlock Bycoda to connect.");
      if (
        error.message ===
        "The saved device credential could not be read. Unlock the app or pair this computer again."
      )
        return copy(
          "Kaydedilen cihaz anahtarı okunamadı. Uygulamanın kilidini aç veya bu bilgisayarı yeniden bağla.",
          "The saved device credential could not be read. Unlock the app or pair this computer again.",
        );
      if (
        error.message ===
        "Access changed while waiting for this computer. Restore access and check the result before retrying."
      )
        return copy(
          "Bilgisayar beklenirken erişim değişti. Yeniden denemeden önce erişimi geri yükleyip sonucu kontrol et.",
          "Access changed while waiting for this computer. Restore access and check the result before retrying.",
        );
      if (
        error.message ===
          "This device credential is invalid or revoked. Pair the computer again." ||
        error.message === "Pair this computer with a valid bycoda device credential."
      )
        return copy(
          "Cihaz anahtarı geçersiz veya iptal edilmiş. Bilgisayar bağlantısını yenile.",
          "Your device key is invalid or revoked. Update the computer connection.",
        );
      return error.message;
    // Preserve detailed host validation/protocol errors, including status and field details.
    default:
      return error.message;
  }
}

/** Presentation only: retain the original error object and any caller-supplied context. */
export function errorMessage(error: unknown, copy: ErrorCopy, override?: string): string {
  const fallback = () => copy("İşlem tamamlanamadı.", "Could not complete this action.");
  const text =
    override ??
    (error instanceof RemoteHostError
      ? remoteMessage(error, copy) || fallback()
      : error instanceof Error
        ? error.message || fallback()
        : typeof error === "string" && error
          ? error
          : fallback());
  if (!(error instanceof RemoteHostError) || !error.uncertain) return text;
  const caution = copy(
    "İşlem uygulanmış olabilir. Yeniden denemeden önce sonucu kontrol et.",
    "The action may have been applied. Check the result before trying again.",
  );
  return text.includes(caution) ? text : `${text}\n\n${caution}`;
}
