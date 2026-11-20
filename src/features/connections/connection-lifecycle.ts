import {
  MOBILE_PAIRING_TTL_MS,
  type MobilePairingCode,
} from "../../../../src/integrations/mobile-pairing";

/**
 * A scanned ticket lives one TTL from when this phone received it, so a skewed phone clock never
 * decides expiry (the Host still checks on redeem). An unreadable expiry fails closed.
 */
export function pairingCodeExpired(
  code: Pick<MobilePairingCode, "expiresAt">,
  receivedAt: number,
  now = Date.now(),
): boolean {
  return !Number.isFinite(Date.parse(code.expiresAt)) || now - receivedAt >= MOBILE_PAIRING_TTL_MS;
}
