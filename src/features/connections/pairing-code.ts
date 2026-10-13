import {
  MobilePairingCodeError,
  parseMobilePairingCode,
} from "../../../../src/integrations/mobile-pairing";
import type { MobilePairingCode } from "../../../../src/integrations/mobile-pairing";
import { RemoteHostError } from "@/remote/transport";
import type { PairingCopy, PairingFailureKind } from "./connection-types";

export { parseMobilePairingCode };
export type { MobilePairingCode };

export class PairingFailure extends Error {
  constructor(readonly kind: PairingFailureKind) {
    super(kind);
    this.name = "PairingFailure";
  }
}

/** A 32-byte random claim identifies an owner retry without becoming a device key. */
export function pairingClaimId(bytes: Uint8Array): string {
  if (bytes.length !== 32) throw new Error("Invalid pairing claim length.");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let value = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      value += alphabet[(buffer >>> bits) & 63];
    }
  }
  if (bits) value += alphabet[(buffer << (6 - bits)) & 63];
  return value;
}

export function pairingErrorMessage(error: unknown, copy: PairingCopy): string {
  const kind =
    error instanceof MobilePairingCodeError ||
    error instanceof PairingFailure ||
    error instanceof RemoteHostError
      ? error.kind
      : undefined;
  switch (kind) {
    case "expired":
      return copy(
        "Kodun süresi doldu. Bilgisayarında yeni bir kod oluştur.",
        "This code expired. Create a new code on your computer.",
      );
    case "insecure-endpoint":
      return copy(
        "Bu kod güvenli bir bilgisayar adresi içermiyor.",
        "This code does not contain a secure computer address.",
      );
    case "used":
      return copy(
        "Bu kod kullanıldı. Bilgisayarında yeni bir kod oluştur.",
        "This code was already used. Create a new code on your computer.",
      );
    case "code-unavailable":
      return copy(
        "Bu kod kullanılamıyor. Bilgisayarında yeni bir kod oluştur.",
        "This code is no longer available. Create a new code on your computer.",
      );
    case "rate-limit":
      return copy(
        "Çok fazla bağlantı denemesi yapıldı. Biraz bekleyip yeniden dene.",
        "Too many pairing attempts. Wait briefly and retry.",
      );
    case "identity":
      return copy(
        "Bilgisayar kimliği kodla eşleşmiyor. Bilgisayarında yeni bir kod oluştur.",
        "The computer identity does not match this code. Create a new code on your computer.",
      );
    case "aborted":
      return copy("Bağlantı iptal edildi.", "Connection cancelled.");
    case "access":
      return copy("Bağlanmak için Bycoda’nın kilidini aç.", "Unlock Bycoda to connect.");
    case "auth":
      return copy(
        "Bağlantı yetkilendirilemedi. Bilgisayarında yeni bir kod oluştur.",
        "The connection could not be authorized. Create a new code on your computer.",
      );
    case "timeout":
    case "network":
      return copy(
        "Bilgisayara ulaşılamadı. Bağlantıyı kontrol edip yeniden dene.",
        "The computer could not be reached. Check the connection and retry.",
      );
    case "unavailable":
      return copy(
        "Bilgisayar bu eşleştirmeyi desteklemiyor. Bycoda’yı güncelle veya manuel bağlan.",
        "This computer does not support pairing. Update Bycoda or connect manually.",
      );
    default:
      return copy("Geçerli bir Bycoda bağlantı kodu kullan.", "Use a valid Bycoda pairing code.");
  }
}
