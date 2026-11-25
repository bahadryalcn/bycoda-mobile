import type { RemoteErrorKind } from "../remote/types";
import type { ConnectionPhase } from "./connection-presentation";

type Copy = (turkish: string, english: string, values?: Record<string, string | number>) => string;

/**
 * One short plain-words line saying why a computer is not connected, or undefined while the
 * state needs no explanation. The phase names the state; this names the cause.
 */
export function connectionReason(
  phase: ConnectionPhase,
  kind: RemoteErrorKind | undefined,
  name: string,
  copy: Copy,
  proofRefusal?: "required" | "invalid",
): string | undefined {
  if (phase === "startup-failed")
    return copy("Bycoda’yı kapatıp yeniden aç.", "Close and reopen Bycoda.");
  if (phase !== "disconnected" && phase !== "access") return undefined;
  const values = { p0: name };
  if (kind === "auth" && proofRefusal === "required")
    return copy(
      "{p0} bu telefonu önce yerel ağ veya Tailscale üzerinden doğrulamalı. Bir kez orada bağlan veya yeniden eşleştir.",
      "{p0} must confirm this phone over the local network or Tailscale first. Connect there once, or pair again.",
      values,
    );
  if (kind === "auth" && proofRefusal === "invalid")
    return copy(
      "{p0} bu telefonun anahtarını doğrulayamadı. Telefonun tarih ve saatini kontrol et veya yeniden eşleştir.",
      "{p0} couldn't verify this phone's key. Check the phone's date and time, or pair again.",
      values,
    );
  if (phase === "access" || kind === "auth")
    return copy("Eşleşme süresi doldu. {p0} bilgisayarını yeniden eşleştir.", "Pairing expired. Pair {p0} again.", values);
  switch (kind) {
    case undefined:
    case "network":
      return copy("{p0} bu ağda erişilemiyor.", "Can't reach {p0} on this network.", values);
    case "timeout":
      return copy(
        "{p0} yanıt vermiyor. Meşgul olabilir veya yeniden başlıyor olabilir.",
        "{p0} isn't answering. It may be busy or restarting.",
        values,
      );
    case "identity":
      return copy("Farklı bir bilgisayar yanıt verdi. {p0} bilgisayarını yeniden eşleştir.", "A different computer answered. Pair {p0} again.", values);
    case "unsupported":
    case "protocol":
      return copy("{p0} üzerindeki bycoda’nın güncellenmesi gerekiyor.", "bycoda on {p0} needs an update.", values);
    default:
      return copy("{p0} bir hata bildirdi.", "{p0} reported an error.", values);
  }
}

/** Reconnecting cannot fix a refused or replaced pairing, so only pairing again helps. */
export const connectionNeedsPairing = (phase: ConnectionPhase, kind: RemoteErrorKind | undefined) =>
  phase === "access" || kind === "auth" || kind === "identity";
