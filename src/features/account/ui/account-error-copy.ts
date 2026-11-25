import { AccountApiError } from "../contracts/errors";
import { pushTokenMessage } from "../../push/push-error-copy";

type Copy = (tr: string, en: string) => string;

const sessionRejected = (copy: Copy) =>
  copy(
    "Hesap sunucusu oturumunu kabul etmedi. Biraz sonra yeniden dene; sürerse çıkış yapıp tekrar giriş yap.",
    "The account server did not accept your session. Retry in a moment; if it continues, sign out and sign in again.",
  );

/** A failed `fetch` and the client deadline are both `TypeError`s: the request never got an answer. */
const unreachable = (copy: Copy) =>
  copy(
    "bycoda hesap hizmetine ulaşılamadı. İnternet bağlantını kontrol edip yeniden dene.",
    "The bycoda account service could not be reached. Check the internet connection, then retry.",
  );

export function deviceLimitReached(error: unknown): boolean {
  return error instanceof AccountApiError && error.code === "conflict" && /device limit/i.test(error.message);
}

/** Says why this phone could not join the account when the server gave a reason the owner can act on. */
export function registrationMessage(error: Error, copy: Copy, where: "account" | "elsewhere" = "account") {
  if (deviceLimitReached(error))
    return where === "account"
      ? copy(
          "Hesabındaki cihaz sınırı dolu. Aşağıdan kullanmadığın bir cihazın oturumunu kapat, sonra yeniden dene.",
          "Your account has reached its device limit. Sign out a device you no longer use below, then retry.",
        )
      : copy(
          "Hesabındaki cihaz sınırı dolu. Hesap ekranında kullanmadığın bir cihazın oturumunu kapat, sonra yeniden dene.",
          "Your account has reached its device limit. Sign out a device you no longer use on the Account screen, then retry.",
        );
  if (error instanceof AccountApiError && error.code === "unauthorized") return sessionRejected(copy);
  if (error instanceof AccountApiError && error.code === "forbidden")
    return copy("Bu hesapta telefon kaydı açık değil.", "Phones are not enabled for this account.");
  return copy("Bu telefon hesaba kaydedilemedi.", "This phone could not be registered to your account.");
}

/** An account read that failed: the specific cause when the owner can act on it, else `fallback`. */
export function accountReadMessage(error: unknown, copy: Copy, fallback: string): string {
  if (error instanceof TypeError) return unreachable(copy);
  if (error instanceof AccountApiError && error.code === "unauthorized") return sessionRejected(copy);
  if (error instanceof AccountApiError && error.code === "rate_limited")
    return copy(
      "Hesap hizmeti şu an çok fazla istek alıyor. Bir dakika bekleyip yeniden dene.",
      "The account service is receiving too many requests. Wait a minute, then retry.",
    );
  return fallback;
}

/**
 * Why this phone's account notifications could not be set up although the OS permission may be on:
 * the push token, or the account service refusing or missing the upload.
 */
export function accountPushMessage(error: unknown, copy: Copy): string {
  const token = pushTokenMessage(error, copy);
  if (token) return token;
  if (error instanceof AccountApiError && error.code === "forbidden")
    return copy("Bu hesapta telefon bildirimleri açık değil.", "Push notifications are not enabled for this account.");
  if (error instanceof AccountApiError && error.code === "not_found")
    return copy(
      "Bu telefonun hesap kaydı bulunamadı. Yeniden kaydetmek için yeniden dene.",
      "This phone's account registration was not found. Retry to register it again.",
    );
  return accountReadMessage(
    error,
    copy,
    copy(
      "Bildirim izni açık, ancak bu telefon hesap bildirimlerine kaydedilemedi. Biraz sonra yeniden dene.",
      "Notifications are allowed, but this phone could not be registered for account notifications. Retry in a moment.",
    ),
  );
}

/** The account service no longer knows this phone's device record; registering again fixes it. */
export function needsReregistration(error: unknown): boolean {
  return error instanceof AccountApiError && error.code === "not_found";
}
