import { TimeoutError } from "../../../../src/shared/lib/withTimeout";
import { PushTokenError } from "./push-token-error";

type Copy = (tr: string, en: string) => string;

/**
 * Owner-facing text for a failure to obtain this phone's push token, shared by computer and account
 * notifications. Returns undefined for any other failure so the caller keeps its own wording.
 */
export function pushTokenMessage(error: unknown, copy: Copy): string | undefined {
  if (error instanceof TimeoutError)
    return copy("Bildirim hizmetinin yanıtı çok uzun sürdü.", "The notification service took too long to respond.");
  if (!(error instanceof PushTokenError)) return undefined;
  if (error.buildMisconfigured)
    return copy(
      "Bu uygulama sürümü uzaktan bildirimler için ayarlanmamış. Bildirim desteğiyle oluşturulmuş bir sürüm yükle.",
      "This app build is not set up for remote notifications. Install a build made with push notification support.",
    );
  return process.env.EXPO_OS === "ios"
    ? copy(
        "Apple bu telefona bildirim anahtarı vermedi. İnternet bağlantını kontrol edip yeniden dene.",
        "Apple did not give this phone a notification token. Check the internet connection, then retry.",
      )
    : copy(
        "Google bu telefona bildirim anahtarı vermedi. İnternet bağlantını ve Google Play hizmetlerini kontrol edip yeniden dene.",
        "Google did not give this phone a notification token. Check the internet connection and Google Play services, then retry.",
      );
}
