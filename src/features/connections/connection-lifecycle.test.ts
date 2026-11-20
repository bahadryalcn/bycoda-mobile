import { describe, expect, it } from "vitest";
import { pairingCodeExpired } from "./connection-lifecycle";

const received = Date.parse("2026-11-19T10:00:00.000Z");
const TTL = 120_000;

describe("pairing code lifetime across app leave and return", () => {
  it("keeps a scanned code usable inside one TTL of receipt", () => {
    expect(pairingCodeExpired({ expiresAt: "2026-11-19T10:02:00.000Z" }, received, received + 60_000)).toBe(false);
  });

  it("expires a scanned code one TTL after this phone received it", () => {
    expect(pairingCodeExpired({ expiresAt: "2026-11-19T10:02:00.000Z" }, received, received + TTL)).toBe(true);
  });

  it("ignores the desktop's expiry stamp when the phone clock is skewed", () => {
    // Phone 10 minutes ahead of the desktop: the stamp is already past by phone clock, yet the code was just received.
    expect(pairingCodeExpired({ expiresAt: "2026-11-19T09:52:00.000Z" }, received, received)).toBe(false);
    // Phone 10 minutes behind: the stamp looks far in the future, but the TTL still closes.
    expect(pairingCodeExpired({ expiresAt: "2026-11-19T10:12:00.000Z" }, received, received + TTL)).toBe(true);
  });

  it("fails closed when the expiry cannot be read", () => {
    expect(pairingCodeExpired({ expiresAt: "not-a-date" }, received, received)).toBe(true);
  });
});
