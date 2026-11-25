import { beforeEach, describe, expect, it, vi } from "vitest";
const seeds = vi.hoisted(() => ({ getProofSeed: vi.fn(), saveProofSeed: vi.fn() }));
vi.mock("./machines", () => ({ credentials: seeds }));
import { ensureDeviceProofBinding, resetProofBindingForTests } from "./proof-binding";
import { RemoteHostError } from "../remote/host-error";
import { DEVICE_PROOF_CAPABILITY, decodeProofSeed } from "../remote/device-proof";
import type { HostDescriptor, MobileMachine } from "../remote/types";

const lan: MobileMachine = {
  id: "pc",
  name: "PC",
  endpoint: "http://192.168.1.20:3777",
  lanKey: "ab".repeat(32),
  environmentId: "env-1",
};
const descriptor = (credential: HostDescriptor["credential"], capabilities = [DEVICE_PROOF_CAPABILITY]) =>
  ({
    protocolVersion: 1,
    environmentId: "env-1",
    name: "PC",
    providers: [],
    capabilities,
    credential,
  }) as unknown as HostDescriptor;
const unbound = descriptor({ localDesktop: false, proofBound: false });

describe("binding an existing credential to a phone key", () => {
  beforeEach(() => {
    resetProofBindingForTests();
    seeds.getProofSeed.mockReset().mockResolvedValue(null);
    seeds.saveProofSeed.mockReset().mockResolvedValue(undefined);
  });

  it("stores a new seed before the request and sends the matching public key", async () => {
    const order: string[] = [];
    seeds.saveProofSeed.mockImplementation(async () => void order.push("save"));
    const request = vi.fn(async () => void order.push("bind"));
    expect(await ensureDeviceProofBinding(lan, unbound, request)).toBe("bound");
    expect(order).toEqual(["save", "bind"]);
    const seed = seeds.saveProofSeed.mock.calls[0][1] as Uint8Array;
    expect(decodeProofSeed(Buffer.from(seed).toString("base64url"))).toEqual(seed);
    expect(request).toHaveBeenCalledWith("devices.bindProofKey", { proofKey: expect.objectContaining({ kty: "OKP", crv: "Ed25519" }) }, { retry: false });
  });

  it("reuses the saved seed after an uncertain failure and retries only after the cooldown", async () => {
    const seed = new Uint8Array(32).fill(3);
    seeds.getProofSeed.mockResolvedValue(seed);
    const request = vi.fn().mockRejectedValueOnce(new RemoteHostError("pc", "network", "down")).mockResolvedValue(undefined);
    expect(await ensureDeviceProofBinding(lan, unbound, request, 1_000)).toBe("failed");
    expect(await ensureDeviceProofBinding(lan, unbound, request, 2_000)).toBe("skipped");
    expect(await ensureDeviceProofBinding(lan, unbound, request, 70_000)).toBe("bound");
    expect(seeds.saveProofSeed).not.toHaveBeenCalled();
  });

  it("does not loop after the Host refuses the bind", async () => {
    const request = vi.fn().mockRejectedValue(new RemoteHostError("pc", "host", "refused"));
    expect(await ensureDeviceProofBinding(lan, unbound, request, 1_000)).toBe("failed");
    expect(await ensureDeviceProofBinding(lan, unbound, request, 10_000_000)).toBe("skipped");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("never binds over a public route, an old Host or an already bound credential", async () => {
    const request = vi.fn();
    const publicRoute = { ...lan, endpoint: "https://pc.example", lanKey: undefined, public: true as const };
    expect(await ensureDeviceProofBinding(publicRoute, unbound, request)).toBe("skipped");
    expect(await ensureDeviceProofBinding(lan, descriptor(undefined, []), request)).toBe("skipped");
    expect(await ensureDeviceProofBinding(lan, descriptor({ localDesktop: false, proofBound: true }), request)).toBe("skipped");
    expect(request).not.toHaveBeenCalled();
    expect(seeds.saveProofSeed).not.toHaveBeenCalled();
  });
});
