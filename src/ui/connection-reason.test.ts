import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({}));
import { connectionNeedsPairing, connectionReason } from "./connection-reason";
import { localNetworkGated } from "./local-network-permission";

const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace(/\{p0\}/g, String(values?.p0 ?? ""));

describe("connection reason", () => {
  // Android 17 dropped every LAN packet after "Nearby devices" was refused; the phone said bab was busy.
  it("names a refused local network instead of a silent computer", () => {
    expect(connectionReason("disconnected", "timeout", "bab", copy, true)).toBe("This phone blocks bycoda from the local network. Allow Nearby devices for bycoda in Settings.");
    expect(connectionReason("disconnected", "auth", "bab", copy, true)).toBe("Pairing expired. Pair bab again.");
    expect(localNetworkGated("android", 36)).toBe(true);
    expect(localNetworkGated("android", 35)).toBe(false);
    expect(localNetworkGated("ios", 36)).toBe(false);
  });
  it("explains only states that are not connected", () => {
    for (const phase of ["connected", "checking", "offline", "locked", "unpaired"] as const)
      expect(connectionReason(phase, "network", "bab", copy)).toBeUndefined();
  });
  it("names the cause of a lost connection in plain words", () => {
    expect(connectionReason("disconnected", "network", "bab", copy)).toBe("Can't reach bab on this network.");
    expect(connectionReason("disconnected", "timeout", "bab", copy)).toBe("bab isn't answering. It may be busy or restarting.");
    expect(connectionReason("disconnected", "unsupported", "bab", copy)).toBe("bycoda on bab needs an update.");
    expect(connectionReason("disconnected", undefined, "bab", copy)).toBe("bab reported an error.");
  });
  it("asks to pair again when the pairing was refused or replaced", () => {
    expect(connectionReason("access", "auth", "bab", copy)).toBe("Pairing expired. Pair bab again.");
    expect(connectionReason("disconnected", "identity", "bab", copy)).toBe("A different computer answered. Pair bab again.");
    expect(connectionNeedsPairing("access", undefined)).toBe(true);
    expect(connectionNeedsPairing("disconnected", "identity")).toBe(true);
    expect(connectionNeedsPairing("disconnected", "network")).toBe(false);
  });
});
