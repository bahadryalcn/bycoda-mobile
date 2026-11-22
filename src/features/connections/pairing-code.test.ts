import { describe, expect, it } from "vitest";
import {
  pairingClaimId,
  pairingErrorMessage,
  pairingNeedsNewCode,
  parseDesktopPairingCode,
  parseMobilePairingCode,
  PairingFailure,
} from "./pairing-code";
import { MobilePairingCodeError } from "../../../../src/integrations/mobile-pairing";

const payload = (expiresAt: string) =>
  JSON.stringify({
    kind: "bycoda.mobile-pairing",
    version: 1,
    endpoint: "https://pc.example",
    environmentId: "pc-environment",
    name: "Work PC",
    ticket: "t".repeat(43),
    expiresAt,
  });

describe("mobile pairing code adapters", () => {
  it("accepts a desktop-stamped expiry regardless of the phone clock", () => {
    const now = Date.now();
    // Desktop 10 minutes behind the phone: the fresh ticket reads as long expired on the phone clock.
    expect(parseDesktopPairingCode(payload(new Date(now - 480_000).toISOString())).ticket).toBe("t".repeat(43));
    // Desktop 10 minutes ahead: the fresh ticket reads as beyond the TTL window on the phone clock.
    expect(parseDesktopPairingCode(payload(new Date(now + 720_000).toISOString())).ticket).toBe("t".repeat(43));
    // The shared parser still rejects the same skewed payloads when judged against the phone clock.
    expect(() => parseMobilePairingCode(payload(new Date(now + 720_000).toISOString()))).toThrow(MobilePairingCodeError);
  });

  it("still rejects a malformed or unreadable expiry", () => {
    expect(() => parseDesktopPairingCode(payload("not-a-date"))).toThrow(MobilePairingCodeError);
    expect(() => parseDesktopPairingCode("not json")).toThrow(MobilePairingCodeError);
  });

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

  it.each(["expired", "used", "code-unavailable", "identity"] as const)(
    "requires a fresh code after a %s rejection",
    (kind) => expect(pairingNeedsNewCode(new PairingFailure(kind))).toBe(true),
  );

  it.each(["network", "timeout", "rate-limit", "access", "aborted"] as const)(
    "keeps the current claim for %s",
    (kind) => expect(pairingNeedsNewCode(new PairingFailure(kind))).toBe(false),
  );
});
