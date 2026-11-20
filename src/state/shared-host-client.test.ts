import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { hostClientKey, retainHostClient, sharedHostClient } from "./shared-host-client";
import type { HostTransport } from "../remote/transport";
import type { MobileMachine } from "../remote/types";

const machine = {
  id: "pc",
  endpoint: "https://pc.example",
  environmentId: "env",
  capabilities: ["transport.ws.streams.v2"],
} as MobileMachine;
const fake = (lost = false) =>
  ({
    prepare: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    hasLostTargetScope: () => lost,
  }) as unknown as HostTransport & { prepare: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> };
const flush = () => Promise.resolve();

it("keeps the unused connection-store mirror removed", () => {
  expect(existsSync(new URL("./connection-store.ts", import.meta.url))).toBe(false);
});

describe("shared host client", () => {
  const access = { allowed: true, check: () => true };
  const socket = {};
  const key = hostClientKey(machine, "scope", access, socket);

  it("keys by exact computer, route, capabilities, consent, access scope and socket runtime", () => {
    expect(hostClientKey({ ...machine }, "scope", access, socket)).toBe(key);
    for (const other of [
      hostClientKey({ ...machine, endpoint: "https://other.example" }, "scope", access, socket),
      hostClientKey({ ...machine, environmentId: "env2" }, "scope", access, socket),
      hostClientKey({ ...machine, lanKey: "lan" }, "scope", access, socket),
      hostClientKey({ ...machine, capabilities: [] }, "scope", access, socket),
      hostClientKey(machine, "scope2", access, socket),
      hostClientKey(machine, "scope", { ...access }, socket),
      hostClientKey(machine, "scope", access, {}),
    ])
      expect(other).not.toBe(key);
  });

  it("serves every consumer of a key one transport, warmed per consumer and disposed after the last", async () => {
    const create = vi.fn(fake);
    const first = sharedHostClient(key, create);
    expect(sharedHostClient(key, create)).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
    const releaseA = retainHostClient(key, first);
    const releaseB = retainHostClient(key, first);
    expect(first.prepare).toHaveBeenCalledTimes(2);
    releaseA();
    releaseA();
    await flush();
    expect(first.dispose).not.toHaveBeenCalled();
    releaseB();
    await flush();
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(sharedHostClient(key, create)).not.toBe(first);
  });

  it("hands the transport to a consumer retained in the same task instead of disposing it", async () => {
    const client = sharedHostClient(key, fake);
    const release = retainHostClient(key, client);
    release();
    const next = retainHostClient(key, client);
    await flush();
    expect(client.dispose).not.toHaveBeenCalled();
    next();
    await flush();
    expect(client.dispose).toHaveBeenCalledTimes(1);
  });

  it("replaces a transport that lost its removed-target scope without disposing its holders", async () => {
    const lost = fake(true);
    const create = vi.fn().mockReturnValueOnce(lost).mockReturnValue(fake());
    const first = sharedHostClient(key, create);
    const release = retainHostClient(key, first);
    const fresh = sharedHostClient(key, create);
    expect(fresh).not.toBe(first);
    expect(first.dispose).not.toHaveBeenCalled();
    release();
    await flush();
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(fresh.dispose).not.toHaveBeenCalled();
    retainHostClient(key, fresh)();
    await flush();
  });
});
