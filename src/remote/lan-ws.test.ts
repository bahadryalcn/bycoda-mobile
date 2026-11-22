import { describe, expect, it } from "vitest";
import {
  requireCredentialBinding,
  requireNativeWssEndpoint,
  requirePairedHostCa,
  selectMobileHostTransport,
  mobileWsMethodEnabled,
} from "./lan-ws";
import { HOST_RPC_METHODS } from "../../../src/shared/model/host-contracts";

describe("mobile WSS route and paired public trust", () => {
  it("never advertises private Native or bridge operations as a mobile method cohort", () => {
    const desktopCapabilities = ["native.workspaces.v1", "native.services.upload.v1"];
    const capabilities = ["transport.ws.v2", "transport.ws.devServers.v2", ...desktopCapabilities];
    const methods = Object.keys(HOST_RPC_METHODS).filter(
      (method) => method.startsWith("native.") || method.startsWith("devServers.bridge"),
    );
    for (const method of [...methods, "native.future.operation", "devServers.bridgeFuture"])
      expect(mobileWsMethodEnabled(capabilities, method)).toBe(false);
    for (const nativeAvailable of [false, true])
      expect(selectMobileHostTransport(desktopCapabilities, nativeAvailable)).toBe("legacy-http");
    for (const method of [
      "workspaces.cleanup.plan",
      "workspaces.cleanup.apply",
      "workspaces.cleanup.status",
    ])
      expect(mobileWsMethodEnabled(["transport.ws.workspaces.cleanup.v1"], method)).toBe(true);
    expect(mobileWsMethodEnabled(["transport.ws.devServers.v2"], "devServers.list")).toBe(true);
    expect(mobileWsMethodEnabled(capabilities, "sessions.list")).toBe(false);
    expect(
      mobileWsMethodEnabled([...capabilities, "transport.ws.sessions.v2"], "sessions.list"),
    ).toBe(true);
  });
  it("uses the canonical per-method capability instead of a broad session prefix", () => {
    expect(mobileWsMethodEnabled(["transport.ws.sessions.v2"], "sessions.list")).toBe(true);
    expect(mobileWsMethodEnabled(["transport.ws.sessions.v2"], "sessions.queue.get")).toBe(false);
    expect(mobileWsMethodEnabled(["transport.ws.queue.v2"], "sessions.queue.get")).toBe(true);
    expect(mobileWsMethodEnabled(["transport.ws.streams.v2"], "subscriptions.open")).toBe(true);
    expect(mobileWsMethodEnabled(["transport.ws.v2"], "sessions.queue.get")).toBe(false);
    expect(mobileWsMethodEnabled(["transport.ws.v2"], "queue.unknown")).toBe(false);
  });
  it("never downgrades a capable Host because TLS or the native module is unavailable", () => {
    expect(selectMobileHostTransport([], false)).toBe("legacy-http");
    expect(selectMobileHostTransport(["transport.ws.read.v2"], false)).toBe("legacy-http");
    expect(selectMobileHostTransport(["transport.ws.read.v2"], true)).toBe("legacy-http");
    expect(selectMobileHostTransport(["transport.ws.future.v999"], false)).toBe("legacy-http");
    expect(selectMobileHostTransport(["transport.ws.v2"], true)).toBe("native-wss");
    expect(() => selectMobileHostTransport(["transport.ws.v2"], false)).toThrow(/native/);
    for (const endpoint of [
      "ws://192.168.1.2/ws",
      "https://host/ws",
      "wss://user:secret@host/ws",
      "wss://host/ws?token=x",
      "wss://host/other",
      "wss://host/ws#fragment",
    ])
      expect(() => requireNativeWssEndpoint(endpoint)).toThrow();
  });
  it("binds CA material to environment and generation without treating a raw key as a pin", () => {
    const ca = {
      version: 1,
      environmentId: "environment-a",
      caGeneration: 1,
      caCertificatePem: "-----BEGIN CERTIFICATE-----\npublic-fixture\n-----END CERTIFICATE-----",
      caSpkiPin: "sha256/" + "a".repeat(43) + "=",
    };
    expect(requirePairedHostCa(ca, "environment-a")).toEqual(ca);
    for (const changed of [
      { ...ca, environmentId: "environment-b" },
      { ...ca, caGeneration: 1.5 },
      { ...ca, caSpkiPin: "a".repeat(43) },
      { ...ca, token: "secret" },
    ])
      expect(() => requirePairedHostCa(changed, "environment-a")).toThrow();
    expect(() =>
      requireCredentialBinding({
        machineId: "../other",
        environmentId: "environment-a",
        endpoint: "wss://host/ws",
        credentialGeneration: 1,
        accessEpoch: 1,
      }),
    ).toThrow();
    // DER/SPKI parsing and chain/SAN/validity checks are native, not proven here.
  });
});
