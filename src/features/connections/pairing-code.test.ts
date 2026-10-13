import { describe, expect, it } from "vitest";
import {
  pairingClaimId,
  pairingErrorMessage,
  parseMobilePairingCode,
  PairingFailure,
} from "./pairing-code";
import { MobilePairingCodeError } from "../../../../src/integrations/mobile-pairing";

describe("mobile pairing code adapters", () => {
  it("encodes all 32 random bytes as an unpadded base64url claim", () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => index * 7);
    expect(pairingClaimId(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
    expect(pairingClaimId(bytes)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("does not accept a credential-bearing deep link or legacy host credentials as a QR code", () => {
    expect(() => parseMobilePairingCode("bycoda://pair?token=" + "a".repeat(43))).toThrow(
      MobilePairingCodeError,
    );
    expect(() =>
      parseMobilePairingCode(
        JSON.stringify({ token: "a".repeat(43), endpoint: "https://pc.example" }),
      ),
    ).toThrow(MobilePairingCodeError);
  });

  it("shows safe localized messages without exposing rejected data", () => {
    const copy = (_tr: string, en: string) => en;
    expect(pairingErrorMessage(new MobilePairingCodeError("expired"), copy)).toContain("expired");
    expect(pairingErrorMessage(new PairingFailure("identity"), copy)).toContain("identity");
    expect(pairingErrorMessage(new Error("Secret: " + "a".repeat(43)), copy)).not.toContain(
      "a".repeat(43),
    );
  });
});
