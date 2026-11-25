import { describe, expect, it, vi } from "vitest";
import { connectComputer } from "./computer-connection";
import { pairingRouteIsPublic } from "./pairing-code";
import type { HostDescriptor, MobileMachine } from "@/remote/types";
import type { ComputerConnectionDependencies, ComputerConnectionInput } from "./connection-types";

const host: HostDescriptor = {
  protocolVersion: 1,
  environmentId: "pc-environment",
  name: "Work PC",
  providers: ["codex"],
  capabilities: ["sessions"],
  platform: "win32",
};
const input: ComputerConnectionInput = {
  name: "",
  endpoint: "https://pc.example/",
  credential: "a".repeat(43),
  expectedEnvironmentId: host.environmentId,
};
const existing: MobileMachine = {
  id: "saved-pc",
  endpoint: "https://old.example",
  name: "Work PC",
  environmentId: host.environmentId,
};

function setup(machines: MobileMachine[] = []) {
  const controller = new AbortController();
  const discover = vi.fn().mockResolvedValue(host);
  const flushDrafts = vi.fn().mockResolvedValue(undefined);
  const saveMachine = vi.fn().mockResolvedValue(undefined);
  const assertAccess = vi.fn();
  const dependencies: ComputerConnectionDependencies = {
    discover,
    flushDrafts,
    saveMachine,
    assertAccess,
    getMachines: () => machines,
    createId: () => "new-machine",
    signal: controller.signal,
  };
  return { dependencies, controller, discover, flushDrafts, saveMachine, assertAccess };
}

describe("shared QR and manual computer connection", () => {
  it("signs discovery with the pairing key and saves the seed and the public route with the credential", async () => {
    const setupValue = setup();
    const proofSeed = new Uint8Array(32).fill(5);
    await connectComputer({ ...input, proofSeed, public: true }, setupValue.dependencies);
    expect(setupValue.discover.mock.calls[0][5]).toBe(proofSeed);
    expect(setupValue.saveMachine.mock.calls[0][0]).toMatchObject({ public: true });
    expect(setupValue.saveMachine.mock.calls[0][2]).toBe(proofSeed);
  });
  it("labels only an unkeyed non-tailnet HTTPS pairing address as a public route", () => {
    expect(pairingRouteIsPublic({ endpoint: "https://pc.example" })).toBe(true);
    expect(pairingRouteIsPublic({ endpoint: "https://pc.tail1234.ts.net" })).toBe(false);
    expect(pairingRouteIsPublic({ endpoint: "http://192.168.1.20:3777", lanKey: "ab".repeat(32) })).toBe(false);
  });
  it("carries the pinned key through discovery and saved metadata", async () => {
    const setupValue = setup();
    const lanKey = "ab".repeat(32);
    const lan = { ...input, endpoint: "http://192.168.1.20:3777", lanKey };
    await connectComputer(lan, setupValue.dependencies);
    expect(setupValue.discover).toHaveBeenCalledWith(
      lan.endpoint,
      input.credential,
      setupValue.dependencies.signal,
      lanKey,
      input.expectedEnvironmentId,
      undefined,
    );
    expect(setupValue.saveMachine.mock.calls[0][0]).toMatchObject({
      endpoint: lan.endpoint,
      lanKey,
    });
  });
  it("reuses the authenticated environment identity and keeps credentials outside metadata", async () => {
    const setupValue = setup([existing]);
    await connectComputer(input, setupValue.dependencies);
    const [machine, credential] = setupValue.saveMachine.mock.calls[0];
    expect(machine).toMatchObject({
      id: existing.id,
      name: host.name,
      endpoint: "https://pc.example",
      environmentId: host.environmentId,
    });
    expect(credential).toBe(input.credential);
    expect(JSON.stringify(machine)).not.toContain(input.credential);
    expect(setupValue.flushDrafts.mock.invocationCallOrder[0]).toBeLessThan(
      setupValue.saveMachine.mock.invocationCallOrder[0],
    );
  });

  it("rejects QR identity mismatch before flushing or saving any computer", async () => {
    const setupValue = setup();
    setupValue.discover.mockResolvedValue({ ...host, environmentId: "another-computer" });
    await expect(connectComputer(input, setupValue.dependencies)).rejects.toMatchObject({
      kind: "identity",
    });
    expect(setupValue.flushDrafts).not.toHaveBeenCalled();
    expect(setupValue.saveMachine).not.toHaveBeenCalled();
  });

  it("keeps an edited existing computer bound to its original environment", async () => {
    const setupValue = setup([{ ...existing, environmentId: "other-environment" }]);
    await expect(
      connectComputer(
        { ...input, expectedEnvironmentId: undefined, editingId: existing.id },
        setupValue.dependencies,
      ),
    ).rejects.toMatchObject({ kind: "identity" });
    expect(setupValue.saveMachine).not.toHaveBeenCalled();
  });

  it("does not save after cancellation during a draft flush", async () => {
    const setupValue = setup();
    setupValue.flushDrafts.mockImplementation(async () => setupValue.controller.abort());
    await expect(connectComputer(input, setupValue.dependencies)).rejects.toMatchObject({
      kind: "aborted",
    });
    expect(setupValue.saveMachine).not.toHaveBeenCalled();
  });

  it("does not save when foreground access closes while discovery is pending", async () => {
    const setupValue = setup();
    setupValue.discover.mockImplementation(async () => {
      setupValue.assertAccess.mockImplementation(() => {
        throw new Error("Locked.");
      });
      return host;
    });
    await expect(connectComputer(input, setupValue.dependencies)).rejects.toThrow("Locked.");
    expect(setupValue.saveMachine).not.toHaveBeenCalled();
  });

  it("leaves the caller in control when draft storage fails", async () => {
    const setupValue = setup();
    setupValue.flushDrafts.mockRejectedValue(new Error("Draft could not be saved."));
    await expect(connectComputer(input, setupValue.dependencies)).rejects.toThrow(
      "Draft could not be saved.",
    );
    expect(setupValue.saveMachine).not.toHaveBeenCalled();
  });
});
