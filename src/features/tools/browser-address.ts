import { RemoteHostError } from "@/remote/host-error";
import { errorMessage } from "@/ui/error-message";

type Copy = (tr: string, en: string) => string;

/** A host on the computer itself: opened over http, and never reachable from the phone's own browser. */
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(:\d{1,5})?$/i;
const IP = /^(?:\d{1,3}\.){3}\d{1,3}(:\d{1,5})?$/;
/** At least one dot ("example.com", "www.google.com"); letters of any script, no spaces or credentials. */
const DOMAIN = /^[^\s.:/?#@[\]]+(\.[^\s.:/?#@[\]]+)+(:\d{1,5})?$/u;

/**
 * Turns what a person types into a browser bar ("www.google.com", "localhost:3000") into an
 * http(s) address the shared browser accepts: https by default, http for the computer itself or
 * an IP. Returns undefined for text that is not a web address.
 */
export function browserAddress(input: string): string | undefined {
  const value = input.trim();
  if (!value || value.length > 4096 || /\s/.test(value)) return undefined;
  const scheme = /^([a-z][a-z\d+.-]*):\/\/([^/?#]*)/i.exec(value);
  if (scheme) {
    const host = scheme[2] ?? "";
    if (!/^https?$/i.test(scheme[1]!) || !host || host.includes("@")) return undefined;
    return value;
  }
  const host = /^[^/?#]*/.exec(value)?.[0] ?? "";
  if (LOOPBACK.test(host) || IP.test(host)) return `http://${value}`;
  return DOMAIN.test(host) ? `https://${value}` : undefined;
}

/** The phone can open the same page itself unless it lives on the computer's own loopback. */
export function phoneCanOpen(url: string | null | undefined): url is string {
  if (!url) return false;
  const match = /^https?:\/\/([^/?#]*)/i.exec(url);
  return !!match && !LOOPBACK.test(match[1]!.replace(/^[^@]*@/, ""));
}

/**
 * Browser requests that leave nothing half-applied: reading, claiming, releasing and opening an
 * address. A failure there never needs the "may have been applied" caution; repeating is safe.
 */
const REPEATABLE = new Set(["browser.status", "browser.claim", "browser.release", "browser.open", "browser.frame", "browser.resize"]);

/** Chromium's network failure codes as Playwright reports them in `page.goto` errors. */
function navigationMessage(message: string, copy: Copy): string | undefined {
  if (/net::ERR_NAME_NOT_RESOLVED|net::ERR_NAME_RESOLUTION_FAILED/.test(message))
    return copy("Bu adres bulunamadı. Yazımını kontrol et.", "This address could not be found. Check the spelling.");
  if (/net::ERR_CONNECTION_REFUSED/.test(message))
    return copy(
      "Site bağlantıyı reddetti. Bilgisayardaki bir sunucuysa çalıştığından emin ol.",
      "The site refused the connection. If it is a server on your computer, make sure it is running.",
    );
  if (/net::ERR_INTERNET_DISCONNECTED|net::ERR_NETWORK_CHANGED|net::ERR_ADDRESS_UNREACHABLE/.test(message))
    return copy("Bilgisayarın internete bağlı değil.", "Your computer is not connected to the internet.");
  if (/net::ERR_CERT_|net::ERR_SSL_/.test(message))
    return copy("Bu sitenin güvenlik sertifikası doğrulanamadı.", "This site's security certificate could not be verified.");
  if (/net::ERR_CONNECTION_TIMED_OUT|net::ERR_TIMED_OUT|Timeout \d+ms exceeded/.test(message))
    return copy(
      "Sayfa zamanında yüklenmedi. Ekranı yenileyerek açılıp açılmadığını kontrol et.",
      "The page did not load in time. Refresh the screen to see whether it opened.",
    );
  if (/^page\.goto:|net::ERR_/.test(message))
    return copy("Bu sayfa açılamadı.", "This page could not be opened.");
  return undefined;
}

/** Exact shared-browser refusals the Host reports in English, localized and with their next step. */
function knownBrowserMessage(message: string, copy: Copy): string | undefined {
  if (message === "Enter a web address such as example.com." || message === "Invalid browser URL" || message === "Invalid URL")
    return copy("example.com gibi bir web adresi yaz.", "Enter a web address such as example.com.");
  if (message === "Use an HTTP(S) URL without credentials")
    return copy("Kullanıcı adı veya parola içermeyen bir http(s) adresi yaz.", "Enter an http(s) address without a user name or password.");
  if (message.startsWith("Another client controls this browser"))
    return copy(
      "Ortak tarayıcıyı şu anda başka bir cihaz veya oturum kullanıyor.",
      "Another device or session is using the shared browser right now.",
    );
  if (message.startsWith("Shared browser is busy"))
    return copy("Ortak tarayıcı başka bir işlemi bitiriyor. Biraz sonra yeniden dene.", "The shared browser is finishing another request. Try again shortly.");
  if (message.startsWith("Claim browser control before"))
    return copy("Tarayıcı denetimi sona erdi. Yeniden dene.", "Browser control expired. Try again.");
  if (message.startsWith("Shared browser requires Playwright"))
    return copy("Bilgisayarda tarayıcı araçları kurulu değil.", "Browser tools are not set up on your computer.");
  if (message === "Open a shared browser first" || message.startsWith("Open a browser for this session"))
    return copy("Önce bir adres aç.", "Open an address first.");
  if (message === "Browser frame exceeds transfer budget")
    return copy("Tarayıcı görüntüsü aktarmak için çok büyük.", "The browser image is too large to transfer.");
  return navigationMessage(message, copy);
}

/**
 * The one message for a failed browser request: known Host refusals are localized, repeatable
 * requests never carry the uncertain-write caution, and everything else uses the shared mapping.
 */
export function browserErrorMessage(error: unknown, method: string | undefined, copy: Copy): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const known = error instanceof RemoteHostError && !["host", "protocol"].includes(error.kind) ? undefined : knownBrowserMessage(message, copy);
  if (known) return known;
  return errorMessage(error, copy, undefined, { read: !!method && REPEATABLE.has(method) });
}

/** Another client holds the browser: the person can take over instead of meeting a refusal later. */
export function isBrowserHeldElsewhere(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Another client controls this browser");
}
