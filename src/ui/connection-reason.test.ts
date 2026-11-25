import { describe, expect, it } from "vitest";
import { connectionNeedsPairing, connectionReason } from "./connection-reason";

const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace(/\{p0\}/g, String(values?.p0 ?? ""));

describe("connection reason", () => {
  it("explains only states that are not connected", () => {
    for (const phase of ["connected", "checking", "offline", "locked", "unpaired"] as const)
      expect(connectionReason(phase, "network", "bab", copy)).toBeUndefined();
  });
  it("names the cause of a lost connection in plain words", () => {
    expect(connectionReason("disconnected", "network", "bab", copy)).toBe("Can't reach bab on this network.");
    expect(connectionReason("disconnected", "timeout", "bab", copy)).toBe("bab isn't answering. It may be busy or restarting.");
    expect(connectionReason("disconnected", "unsupported", "bab", copy)).toBe("bycoda on bab needs an update.");
    expect(connectionReason("disconnected", undefined, "bab", copy)).toBe("Can't reach bab on this network.");
  });
  it("names the private connection a proof refusal needs instead of an expired pairing", () => {
    expect(connectionReason("access", "auth", "bab", copy, "required")).toBe(
      "bab must confirm this phone over the local network or Tailscale first. Connect there once, or pair again.",
    );
    expect(connectionReason("access", "auth", "bab", copy, "invalid")).toContain("couldn't verify this phone's key");
  });
  it("asks to pair again when the pairing was refused or replaced", () => {
    expect(connectionReason("access", "auth", "bab", copy)).toBe("Pairing expired. Pair bab again.");
    expect(connectionReason("disconnected", "identity", "bab", copy)).toBe("A different computer answered. Pair bab again.");
    expect(connectionNeedsPairing("access", undefined)).toBe(true);
    expect(connectionNeedsPairing("disconnected", "identity")).toBe(true);
    expect(connectionNeedsPairing("disconnected", "network")).toBe(false);
  });
});
