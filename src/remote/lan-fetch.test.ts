import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptedLanFetch } from "./lan-fetch";
import { createLanIdentity, openLanRequest } from "../../../host/mobile/mobile-lan-crypto";
import { HostTransport } from "./host-transport";
import { redeemMobilePairingCode } from "../features/connections/pairing-redeem";
import { deviceProofKeyFromSeed, verifyDeviceProof } from "../../../src/integrations/device-proof";
import { proofKeyOf } from "./device-proof";

const proofKey = proofKeyOf(new Uint8Array(32).fill(7));

vi.mock("expo-crypto", () => ({
  getRandomBytesAsync: async (size: number) => new Uint8Array(randomBytes(size)),
}));
const endpoint = "http://192.168.1.20:3777";
const environmentId = "computer";
const token = "a".repeat(43);
const ticket = "b".repeat(43);
describe("mobile LAN encryption interoperability", () => {
  it("carries a bound device's proof inside the encrypted envelope", async () => {
    const identity = createLanIdentity();
    const seed = new Uint8Array(32).fill(9);
    let received: { proof?: string; path: string; token?: string } | undefined;
    const wire = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/hello"))
        return new Response(JSON.stringify({ version: 1, epoch: "cd".repeat(32) }));
      const opened = openLanRequest(JSON.parse(String(init?.body)), identity, environmentId);
      received = opened.input;
      return new Response(JSON.stringify(opened.seal({ status: 200, body: '{"result":[]}' })));
    });
    const transport = new HostTransport(
      { id: "pc", name: "PC", endpoint, lanKey: identity.publicKey, environmentId },
      async () => token,
      wire,
      undefined,
      async () => seed,
    );
    await transport.request("projects.list");
    expect(received?.proof).toBeTypeOf("string");
    expect(wire.mock.calls.every(([, init]) => !JSON.stringify(init).includes(received!.proof!))).toBe(true);
    expect(
      verifyDeviceProof({
        proof: received!.proof!,
        token,
        method: "POST",
        path: received!.path,
        environmentId,
        expectedJkt: deviceProofKeyFromSeed(seed).jkt,
      }),
    ).toMatchObject({ ok: true });
  });
  it("rechecks app access after asynchronous encryption before sending credentials", async () => {
    const wire = vi.fn<typeof fetch>();
    const identity = createLanIdentity();
    let allowed = true;
    const guard = () => {
      if (!allowed) throw new Error("App locked");
    };
    wire.mockImplementation(async () => {
      allowed = false;
      return new Response(JSON.stringify({ version: 1, epoch: "cd".repeat(32) }));
    });
    const encrypted = encryptedLanFetch(wire, environmentId, identity.publicKey, undefined, guard);
    await expect(
      encrypted(`${endpoint}/rpc`, {
        method: "POST",
        body: "{}",
        headers: { Authorization: `Bearer ${token}` },
      }),
    ).rejects.toThrow("locked");
    expect(wire).toHaveBeenCalledTimes(1);
    expect(wire.mock.calls[0][1]?.method).toBe("GET");
  });
  it("encrypts pairing and subsequent RPC through the actual mobile transport", async () => {
    const identity = createLanIdentity();
    const wire = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith("/hello"))
        return new Response(JSON.stringify({ version: 1, epoch: "cd".repeat(32) }));
      expect(url).toBe(`${endpoint}/mobile/lan`);
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      expect(String(init?.body)).not.toContain(token);
      expect(String(init?.body)).not.toContain(ticket);
      const opened = openLanRequest(JSON.parse(String(init?.body)), identity, environmentId);
      if (opened.input.path === "/mobile/pairing/redeem") {
        expect(JSON.parse(opened.input.body).ticket).toBe(ticket);
        return new Response(
          JSON.stringify(
            opened.seal({
              status: 200,
              body: JSON.stringify({ result: { deviceId: "phone", environmentId, token } }),
            }),
          ),
        );
      }
      expect(opened.input.token).toBe(token);
      expect(JSON.parse(opened.input.body).method).toBe("projects.list");
      return new Response(
        JSON.stringify(opened.seal({ status: 200, body: '{"result":["private workspace"]}' })),
      );
    });
    const code = {
      kind: "bycoda.mobile-pairing" as const,
      version: 1 as const,
      endpoint,
      lanKey: identity.publicKey,
      environmentId,
      name: "PC",
      ticket,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    expect(
      await redeemMobilePairingCode(code, "c".repeat(43), "Phone", {
        fetchImpl: wire,
        assertAccess: () => {}, proofKey,
      }),
    ).toMatchObject({ token, environmentId });
    const transport = new HostTransport(
      { id: "pc", name: "PC", endpoint, lanKey: identity.publicKey, environmentId },
      async () => token,
      wire,
    );
    expect(await transport.request("projects.list")).toEqual(["private workspace"]);
    expect(wire).toHaveBeenCalledTimes(4);
    expect(wire.mock.calls[1][1]?.body).not.toBe(wire.mock.calls[3][1]?.body);
  });
  it("rejects a substituted response or pin without returning attacker-controlled data", async () => {
    const identity = createLanIdentity();
    const changed: typeof fetch = async (url, init) => {
      if (String(url).endsWith("/hello"))
        return new Response(JSON.stringify({ version: 1, epoch: "cd".repeat(32) }));
      const opened = openLanRequest(JSON.parse(String(init?.body)), identity, environmentId);
      const response = opened.seal({ status: 200, body: '{"result":"secret"}' });
      response.data = `${response.data[0] === "0" ? "1" : "0"}${response.data.slice(1)}`;
      return new Response(JSON.stringify(response));
    };
    const request = { method: "POST", body: "{}", headers: { Authorization: `Bearer ${token}` } };
    await expect(
      encryptedLanFetch(changed, environmentId, identity.publicKey)(`${endpoint}/rpc`, request),
    ).rejects.toThrow();
    await expect(
      encryptedLanFetch(
        changed,
        environmentId,
        createLanIdentity().publicKey,
      )(`${endpoint}/rpc`, request),
    ).rejects.toThrow();
  });
});
