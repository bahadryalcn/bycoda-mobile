import { RemoteHostError } from "../remote/host-error";
import { ApprovalCommandRefused } from "../domain/approval-command";

type ErrorCopy = (turkish: string, english: string) => string;

export function remoteErrorKind(error: unknown) {
  return error instanceof RemoteHostError ? error.kind : undefined;
}

function remoteMessage(error: RemoteHostError, copy: ErrorCopy): string {
  if (["auth", "host", "protocol"].includes(error.kind)) {
    const known = knownConnectionMessage(error.message, copy);
    if (known) return known;
  }
  switch (error.kind) {
    case "network":
      return error.uncertain
        ? copy("Bilgisayara ulaşılamadı.", "The computer could not be reached.")
        : copy(
            "Bilgisayara ulaşılamadı. Bağlantıyı kontrol edip yeniden dene.",
            "The computer could not be reached. Check that it is on and bycoda is running, and that Wi-Fi or Tailscale is connected on both devices, then retry.",
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
      return looksLikeSchemaError(error.message)
        ? copy(
            "Bilgisayardan gelen veri anlaşılamadı. Bycoda'yı bilgisayarda ve telefonda güncelle.",
            "The computer sent data this app could not read. Update Bycoda on both devices.",
          )
        : error.message;
  }
}

/** Zod issue dumps (`[{"code":"unrecognized_keys",...}]`) are never user-facing. */
function looksLikeSchemaError(message: string): boolean {
  return /^\s*\[\s*\{\s*"(code|expected|origin)"/.test(message) && /"path"\s*:/.test(message);
}

/** Only exact transport-owned messages are translated; Host details pass through. */
function knownConnectionMessage(message: string, copy: ErrorCopy): string | undefined {
  switch (message) {
    case "Computer access was denied. Reconnect this computer.":
      return copy("Bilgisayara erişim reddedildi. Bu bilgisayarı yeniden bağla.", "Computer access was denied. Reconnect this computer.");
    case "The mobile app and Host use incompatible data. Update both and reconnect.":
      return copy("Mobil uygulama ile Host verileri uyumsuz. İkisini de güncelleyip yeniden bağlan.", "The mobile app and Host use incompatible data. Update both and reconnect.");
    case "The computer certificate could not be verified. Reconnect this computer.":
      return copy("Bilgisayarın sertifikası doğrulanamadı. Bu bilgisayarı yeniden bağla.", "The computer certificate could not be verified. Reconnect this computer.");
    case "This computer is busy. Try again shortly.":
      return copy("Bilgisayar meşgul. Biraz sonra yeniden dene.", "This computer is busy. Try again shortly.");
    case "This computer is not ready for this request. Try again shortly.":
      return copy("Bilgisayar bu isteğe hazır değil. Biraz sonra yeniden dene.", "This computer is not ready for this request. Try again shortly.");
    case "The computer could not complete this request. Try again.":
      return copy("Bilgisayar bu isteği tamamlayamadı. Yeniden dene.", "The computer could not complete this request. Try again.");
    case "The computer rejected this request. Check its details and try again.":
      return copy("Bilgisayar bu isteği reddetti. Ayrıntılarını kontrol edip yeniden dene.", "The computer rejected this request. Check its details and try again.");
    case "Connection interrupted. Check this command's result before trying again.":
      return copy("Bağlantı kesildi. Yeniden denemeden önce bu komutun sonucunu kontrol et.", "Connection interrupted. Check this command's result before trying again.");
    default:
      return undefined;
  }
}

/** Presentation only: retain the original error object and any caller-supplied context. */
export function errorMessage(error: unknown, copy: ErrorCopy, override?: string): string {
  const fallback = () => copy("İşlem tamamlanamadı.", "Could not complete this action.");
  const text =
    override ??
    (error instanceof ApprovalCommandRefused
      ? error.reason === "unsupported"
        ? copy(
            "Bu Host, hangi isteği yanıtladığını doğrulayamıyor. Yanıtlamadan önce Host'u güncelle.",
            "This Host cannot verify which request you are answering. Update the Host before responding.",
          )
        : copy(
            "Bu istek doğrulanamıyor. Konuşmayı yenile veya isteği çalıştıran istemciyi güncelle.",
            "This request cannot be verified. Refresh the conversation or update its execution client.",
          )
      : error instanceof RemoteHostError
        ? remoteMessage(error, copy) || fallback()
        : error instanceof Error
          ? looksLikeSchemaError(error.message)
            ? copy(
                "Bilgisayardan gelen veri anlaşılamadı. Bycoda'yı bilgisayarda ve telefonda güncelle.",
                "The computer sent data this app could not read. Update Bycoda on both devices.",
              )
            : error.message || fallback()
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

/** Provider CLI failures shown in the transcript: calm wording instead of raw command hints. */
export function friendlyProviderFailure(text: string, copy: ErrorCopy): string {
  if (/is archived/i.test(text) && /unarchive/i.test(text))
    return copy(
      "Bu oturum sağlayıcıda arşivlenmiş. Devam etmek için masaüstünde arşivden çıkar, sonra yeniden gönder.",
      "This session is archived with the provider. Unarchive it on your computer, then send again.",
    );
  if (/usage_limit_reached|quota_exceeded|insufficient_quota|(?:usage|weekly|monthly|session)\s+limit\s+(?:reached|exceeded)|(?:you(?:'|’)ve|you have)\s+(?:hit|reached)\s+your\s+(?:(?:usage|weekly|monthly|session)\s+)?limit/i.test(text))
    return `${text}\n\n${copy(
      "Başka bir hesap veya model seçmek için Model ve akıl yürütme'yi açın.",
      "Open Model and reasoning to choose another account or model.",
    )}`;
  return text;
}
