import { describe, expect, it, vi } from "vitest";
import {
  deviceProofKeyFromSeed,
  verifyDeviceProof,
} from "../../../src/integrations/device-proof";
import {
  DEVICE_PROOF_REQUIRED_MESSAGE,
  decodeProofSeed,
  encodeProofSeed,
  isProofRefusal,
  newProofSeed,
  proofKeyOf,
  signRequestProof,
} from "./device-proof";
import { HostTransport } from "./host-transport";
import { RemoteHostError } from "./host-error";
import type { MobileMachine } from "./types";

const token = "t".repeat(43);
const machine: MobileMachine = {
  id: "pc",
  name: "PC",
  endpoint: "https://pc.example",
  environmentId: "env-1",
};
const seed = new Uint8Array(32).map((_, index) => index);
const jkt = deviceProofKeyFromSeed(seed).jkt;
const ok = () => new Response(JSON.stringify({ result: [] }), { status: 200 });

describe("mobile device proofs", () => {
  it("signs a request that the Host verifier accepts, with a fresh jti each time", () => {
    const sign = () =>
      signRequestProof({ seed, token, method: "post", path: "/rpc", environmentId: "env-1" });
    const first = sign();
    const second = sign();
    expect(first).not.toBe(second);
    const verified = verifyDeviceProof({
      proof: first,
      token,
      method: "POST",
      path: "/rpc?ignored=1",
      environmentId: "env-1",
      expectedJkt: jkt,
    });
    expect(verified).toMatchObject({ ok: true, jwk: proofKeyOf(seed) });
    expect(
      verifyDeviceProof({
        proof: first,
        token,
        method: "POST",
        path: "/rpc",
        environmentId: "another-computer",
        expectedJkt: jkt,
      }),
    ).toEqual({ ok: false, reason: "claims" });
  });

  it("stores a seed as 43 base64url characters and rejects anything else", () => {
    const generated = newProofSeed();
    expect(generated).toHaveLength(32);
    const stored = encodeProofSeed(generated);
    expect(stored).toHaveLength(43);
    expect(decodeProofSeed(stored)).toEqual(generated);
    expect(decodeProofSeed("short")).toBeNull();
    expect(decodeProofSeed(null)).toBeNull();
  });

  it("recognises the Host's proof refusals by header or by LAN envelope body", () => {
    expect(isProofRefusal("proof")).toBe(true);
    expect(isProofRefusal("before-dispatch")).toBe(false);
    expect(isProofRefusal(null, { error: "x", reason: "invalid-proof" })).toBe(true);
    expect(isProofRefusal(null, { error: "Unauthorized" })).toBe(false);
  });
});

describe("HostTransport proof signing", () => {
  it("sends a DPoP header bound to POST /rpc for a key-bound credential", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const transport = new HostTransport(machine, async () => token, fetcher, undefined, async () => seed);
    await transport.request("projects.list");
    const headers = fetcher.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${token}`);
    expect(
      verifyDeviceProof({
        proof: headers.DPoP,
        token,
        method: "POST",
        path: "/rpc",
        environmentId: "env-1",
        expectedJkt: jkt,
      }),
    ).toMatchObject({ ok: true });
  });

  it("sends no DPoP header while the credential has no key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const transport = new HostTransport(machine, async () => token, fetcher, undefined, async () => null);
    await transport.request("projects.list");
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty("DPoP");
  });

  it("reports a proof refusal as one blocked auth failure without a retry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: "Device proof is missing or invalid", reason: "proof-required" }), {
          status: 401,
          headers: { "X-Bycoda-Auth-Stage": "proof" },
        }),
    );
    const transport = new HostTransport(machine, async () => token, fetcher, undefined, async () => null);
    const failure = await transport.request("projects.list").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RemoteHostError);
    expect(failure).toMatchObject({ kind: "auth", message: DEVICE_PROOF_REQUIRED_MESSAGE });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
