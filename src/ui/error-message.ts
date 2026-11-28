import { RemoteHostError } from "../remote/host-error";
import { ApprovalCommandRefused } from "../domain/approval-command";
import { catalogFor, type Locale } from "../localization";
import { DEVICE_PROOF_INVALID_MESSAGE, DEVICE_PROOF_REQUIRED_MESSAGE } from "../remote/device-proof";
import { DraftWriteError } from "../state/local-draft-storage";

/** `useCopy()` attaches its locale; plain test/helper copy functions are probed instead. */
export type ErrorCopy = ((turkish: string, english: string) => string) & { readonly locale?: Locale };

const ENGLISH_FALLBACK = "Could not complete this action.";
const PROBE_TURKISH = "\u0001";
const PROBE_ENGLISH = "\u0002";

/** The active language: attached by `useCopy()`, otherwise probed without loading a catalog. */
function activeLocale(copy: ErrorCopy): Locale | undefined {
  if (copy.locale) return copy.locale;
  // Probe values live in constants so the locale extractor never treats them as catalog copy.
  if (copy(PROBE_TURKISH, PROBE_ENGLISH) === PROBE_TURKISH) return "tr";
  // Only English returns the English text of a catalogued message unchanged.
  if (copy("İşlem tamamlanamadı.", "Could not complete this action.") === ENGLISH_FALLBACK) return "en";
  return undefined;
}

type MessagePattern = { regex: RegExp; key: string; names: string[] };
const patternCache = new WeakMap<Record<string, string>, MessagePattern[]>();
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Catalog keys with `{pN}` values (`Request failed ({p0})`) matched against a thrown message. */
function messagePatterns(catalog: Record<string, string>): MessagePattern[] {
  let patterns = patternCache.get(catalog);
  if (patterns) return patterns;
  patterns = [];
  for (const key of Object.keys(catalog)) {
    // Keys that are mostly placeholders would match unrelated text.
    if (!key.includes("{p") || key.startsWith("{") || key.replace(/\{p\d+\}/g, "").length < 10) continue;
    const names: string[] = [];
    const source = key
      .split(/(\{p\d+\})/)
      .map((part) => (/^\{p\d+\}$/.test(part) ? (names.push(part), "(.+?)") : escapeRegex(part)))
      .join("");
    if (names.length) patterns.push({ regex: new RegExp(`^${source}$`), key, names });
  }
  patternCache.set(catalog, patterns);
  return patterns;
}

/**
 * Translate an English app, transport or Host sentence through the active locale catalog, whose
 * keys are the English text. Returns undefined when no catalog knows it (English returns it as is).
 * Only the active language's catalog is read.
 */
export function translateErrorText(message: string, copy: ErrorCopy): string | undefined {
  const locale = activeLocale(copy);
  if (locale === "en") return message;
  if (!locale) {
    // Another language: copy() reads its catalog for exact keys.
    const text = copy(message, message);
    return text !== message ? text : undefined;
  }
  const catalog = catalogFor(locale);
  const direct = catalog[message];
  if (direct) return direct;
  for (const { regex, key, names } of messagePatterns(catalog)) {
    const match = regex.exec(message);
    if (!match) continue;
    return catalog[key]!.replace(/\{p\d+\}/g, (name) => match[names.indexOf(name) + 1] ?? name);
  }
  return undefined;
}

// Transport sentences appended to a Host message when a command's outcome is unknown.
const OUTCOME_SUFFIXES = [
  "The device operation may have completed; its outcome is unknown. Do not repeat this request; inspect the original device or preview status.",
  "The command ran; its outcome is unknown. Do not repeat it before checking.",
];

/**
 * Localized text for an English message. A message no catalog knows becomes a translated summary;
 * the original English stays as a separate trailing paragraph, which `Notice` collapses behind
 * "Details", so support detail is never lost and never replaces the user's language.
 */
function localizedMessage(message: string, copy: ErrorCopy, summary: () => string): string {
  let head = message.trim();
  let suffix: string | undefined;
  for (const candidate of OUTCOME_SUFFIXES)
    if (head !== candidate && head.endsWith(candidate)) {
      head = head.slice(0, -candidate.length).trim();
      suffix = translateErrorText(candidate, copy) ?? candidate;
      break;
    }
  const known = (head && knownConnectionMessage(head, copy)) || (head ? translateErrorText(head, copy) : undefined);
  if (known !== undefined) return suffix ? `${known} ${suffix}` : known;
  const lead = suffix ? `${summary()} ${suffix}` : summary();
  return head ? `${lead}\n\n${head}` : lead;
}

const hostSummary = (copy: ErrorCopy) => () =>
  copy("Bilgisayar bu isteği tamamlayamadı.", "The computer could not complete this request.");

export function remoteErrorKind(error: unknown) {
  return error instanceof RemoteHostError ? error.kind : undefined;
}

/** Failures of the computer connection itself, which a screen reports once rather than per request. */
export function isConnectionLevelError(error: unknown) {
  const kind = remoteErrorKind(error);
  return kind === "auth" || kind === "identity" || kind === "network" || kind === "unsupported";
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
        "Bu özellik için bilgisayarındaki bycoda’yı güncelle.",
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
        return copy("Bağlanmak için bycoda’nın kilidini aç.", "Unlock bycoda to connect.");
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
          "Bu telefonun erişimi kaldırılmış veya geçersiz. Bilgisayarı yeniden eşleştir.",
          "This phone’s access was removed or is invalid. Pair the computer again.",
        );
      return localizedMessage(error.message, copy, () =>
        copy("Bilgisayara erişim reddedildi. Bu bilgisayarı yeniden bağla.", "Computer access was denied. Reconnect this computer."),
      );
    // Host validation/protocol details stay available below a translated summary when unknown.
    default:
      return looksLikeSchemaError(error.message)
        ? copy(
            "Bilgisayardan gelen veri anlaşılamadı. bycoda’yı bilgisayarda ve telefonda güncelle.",
            "The computer sent data this app could not read. Update Bycoda on both devices.",
          )
        : localizedMessage(error.message, copy, hostSummary(copy));
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
      return copy("Mobil uygulama ile bilgisayardaki bycoda uyumsuz. İkisini de güncelleyip yeniden bağlan.", "The mobile app and Host use incompatible data. Update both and reconnect.");
    case "The computer certificate could not be verified. Reconnect this computer.":
      return copy("Bilgisayarın sertifikası doğrulanamadı. Bu bilgisayarı yeniden bağla.", "The computer certificate could not be verified. Reconnect this computer.");
    case DEVICE_PROOF_REQUIRED_MESSAGE:
      return copy(
        "Bu bilgisayar önce telefonu yerel ağ veya Tailscale üzerinden doğrulamalı. Bir kez orada bağlan veya bu bilgisayarı yeniden eşleştir.",
        "This computer must confirm this phone over the local network or Tailscale first. Connect there once, or pair this computer again.",
      );
    case DEVICE_PROOF_INVALID_MESSAGE:
      return copy(
        "Bu bilgisayar telefonun cihaz anahtarını doğrulayamadı. Telefonun tarih ve saatini kontrol edip yeniden bağlan veya yeniden eşleştir.",
        "This computer could not verify this phone's device key. Check the phone's date and time, then reconnect or pair again.",
      );
    case "This computer is busy. Try again shortly.":
      return copy("Bilgisayar meşgul. Biraz sonra yeniden dene.", "This computer is busy. Try again shortly.");
    case "This computer is not ready for this request. Try again shortly.":
      return copy("Bilgisayar bu isteğe hazır değil. Biraz sonra yeniden dene.", "This computer is not ready for this request. Try again shortly.");
    // The Host's generic reply for an unexpected failure (HTTP: no period, socket: with one).
    case "Host request failed":
    case "Host request failed.":
    case "The computer could not complete this request. Try again.":
      return copy("Bilgisayar bu isteği tamamlayamadı. Yeniden dene.", "The computer could not complete this request. Try again.");
    case "The computer rejected this request. Check its details and try again.":
      return copy("Bilgisayar bu isteği reddetti. Ayrıntılarını kontrol edip yeniden dene.", "The computer rejected this request. Check its details and try again.");
    case "Connection interrupted. Check this command's result before trying again.":
      return copy("Bağlantı kesildi. Yeniden denemeden önce bu komutun sonucunu kontrol et.", "Connection interrupted. Check this command's result before trying again.");
    case "Wait for running sessions in this project to finish, then try again.":
      return copy("Bu projede çalışan oturumlar bitince yeniden dene.", "Wait for running sessions in this project to finish, then try again.");
    case "A branch switch is already in progress":
      return copy("Dal değişikliği zaten sürüyor.", "A branch switch is already in progress");
    default:
      return undefined;
  }
}

/** Presentation only: retain the original error object and any caller-supplied context. */
export function errorMessage(error: unknown, copy: ErrorCopy, override?: string, options?: { read?: boolean }): string {
  if (override === undefined && error instanceof DraftWriteError)
    return copy("Taslak kaydedilemedi. Düzenlemelerin açık.", "Couldn’t save the draft. Your edits are still open.");
  const fallback = () => copy("İşlem tamamlanamadı.", "Could not complete this action.");
  const text =
    override ??
    (error instanceof ApprovalCommandRefused
      ? error.reason === "unsupported"
        ? copy(
            "Bilgisayardaki bycoda hangi isteği yanıtladığını doğrulayamıyor. Yanıtlamadan önce onu güncelle.",
            "This Host cannot verify which request you are answering. Update the Host before responding.",
          )
        : error.reason === "sessionGrant"
          ? copy(
              "Bu istek tüm oturum için onaylanamıyor. Bir kez izin ver.",
              "This request cannot be allowed for the whole session. Allow it once instead.",
            )
          : copy(
              "Bu istek doğrulanamıyor. Oturumu yenile veya isteği başlatan uygulamayı güncelle.",
              "This request cannot be verified. Refresh the session or update its execution client.",
            )
      : error instanceof RemoteHostError
        ? remoteMessage(error, copy) || fallback()
        : error instanceof Error
          ? looksLikeSchemaError(error.message)
            ? copy(
                "Bilgisayardan gelen veri anlaşılamadı. bycoda’yı bilgisayarda ve telefonda güncelle.",
                "The computer sent data this app could not read. Update Bycoda on both devices.",
              )
            // App and socket errors carry an English message: shown in the screen's language when a
            // catalog knows it, otherwise as a translated summary with the English as detail.
            : error.message ? localizedMessage(error.message, copy, fallback) : fallback()
          : typeof error === "string" && error
            ? localizedMessage(error, copy, fallback)
            : fallback());
  // A read that failed applied nothing; only writes warn that the action may have gone through.
  if (options?.read || !(error instanceof RemoteHostError) || !error.uncertain) return text;
  // The transport's interruption message already asks to check the result; a second caution only repeats it.
  if (override === undefined && error.message === "Connection interrupted. Check this command's result before trying again.") return text;
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
    // One localized line: the provider's own (English) wording never sits beside the app's language.
    return copy(
      "Kullanım sınırına ulaşıldı. Başka bir hesap veya model seçmek için Model ve erişim'i aç.",
      "Usage limit reached. Open Model and access to choose another account or model.",
    );
  return text;
}
