import type { IllustrationName } from "./illustrations";

/** Picks the full-region error art: unreachable computer, offline device, locked access or generic. */
export function errorIllustration(kind: string | undefined, offline = false): IllustrationName {
  if (offline || kind === "offline") return "offline";
  if (kind === "network" || kind === "timeout") return "unreachable";
  if (kind === "auth" || kind === "identity" || kind === "access") return "locked";
  return "error";
}

/** Short human heading matching `errorIllustration`; the description carries the specific message. */
export function errorTitle(
  kind: string | undefined,
  copy: (turkish: string, english: string) => string,
  offline = false,
): string {
  const art = errorIllustration(kind, offline);
  if (art === "offline") return copy("Çevrimdışısın", "You're offline");
  if (art === "unreachable") return copy("Bilgisayara ulaşılamıyor", "Can't reach your computer");
  if (art === "locked") return copy("Erişim gerekli", "Access needed");
  return copy("Bir şeyler ters gitti", "Something went wrong");
}
