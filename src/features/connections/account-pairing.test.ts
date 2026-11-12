import { describe, expect, it, vi } from "vitest";
import {
  generatePairKeypair,
  pairSasCode,
  sealPairTicket,
} from "../../../../src/integrations/account-pair-crypto";
import { AccountApiError, type Computer } from "../account/contracts";
import {
  accountPairAad,
  AccountPairingError,
  assertPinUnchanged,
  needsNewComputerConfirmation,
  requestAccountPairingCode,
  type AccountPairingClient,
} from "./account-pairing";
import type { MobilePairingCode } from "./pairing-code";
import type { MobileMachine } from "@/remote/types";

const now = Date.parse("2026-11-09T12:00:00.000Z");
const computer: Computer = {
  deviceId: "desk-1",
  name: "Work PC",
  platform: "windows",
  environmentId: "env-1",
  routes: [],
  lastSeenAt: new Date(now).toISOString(),
  updatedAt: new Date(now).toISOString(),
};
const code: MobilePairingCode = {
  kind: "bycoda.mobile-pairing",
  version: 1,
  endpoint: "https://pc.example",
  environmentId: "env-1",
  name: "Work PC",
  ticket: "t".repeat(43),
  expiresAt: new Date(now + 60_000).toISOString(),
};
const idle = async () => {};

function harness(statuses: Array<(phonePublicKey: string) => Promise<unknown> | unknown>) {
  let phonePublicKey = "";
  const client: AccountPairingClient = {
    createPairRequest: vi.fn(async ({ body }) => {
      phonePublicKey = body.phonePublicKey;
      return { id: "req-1", expiresAt: new Date(now + 120_000).toISOString() };
    }),
    getPairRequest: vi.fn(async () => (await statuses.shift()!(phonePublicKey)) as never),
  };
  return client;
}
const run = (
  client: AccountPairingClient,
  extra: object = {},
  signal = new AbortController().signal,
) => {
  const sas: string[] = [];
  const promise = requestAccountPairingCode({
    client,
    computer,
    phoneDeviceId: "phone-1",
    signal,
    now: () => now,
    onCode: (value) => sas.push(value),
    sleep: idle,
    randomBytes: async (size: number) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
    ...extra,
  });
  return { promise, sas };
};
const sealed = async (
  phoneKey: string,
  json: string,
  aad = accountPairAad("req-1", "phone-1", computer),
) => ({
  state: "sealed" as const,
  ...(await sealPairTicket(json, phoneKey, aad)),
});

describe("account pairing", () => {
  it("shows the SAS, polls, opens the box and returns the pairing code", async () => {
    const client = harness([
      () => ({ state: "pending" }),
      (key) => sealed(key, JSON.stringify(code)),
    ]);
    const { promise, sas } = run(client);
    await expect(promise).resolves.toEqual(code);
    expect(client.getPairRequest).toHaveBeenCalledTimes(2);
    expect(sas).toHaveLength(1);
    expect(sas[0]).toMatch(/^\d{6}$/);
    const call = vi.mocked(client.createPairRequest).mock.calls[0][0];
    expect(call.params.deviceId).toBe("desk-1");
    expect(sas[0]).toBe(pairSasCode("req-1", call.body.phonePublicKey));
  });

  it("rejects a box sealed for another request, phone or computer", async () => {
    for (const aad of [
      accountPairAad("req-2", "phone-1", computer),
      accountPairAad("req-1", "phone-2", computer),
      accountPairAad("req-1", "phone-1", { ...computer, environmentId: "env-2" }),
    ]) {
      const client = harness([(key) => sealed(key, JSON.stringify(code), aad)]);
      await expect(run(client).promise).rejects.toMatchObject({ kind: "invalid" });
    }
  });

  it("rejects a code for a different environment", async () => {
    const client = harness([
      (key) => sealed(key, JSON.stringify({ ...code, environmentId: "other" })),
    ]);
    await expect(run(client).promise).rejects.toMatchObject({ kind: "invalid" });
  });

  it("rejects a box sealed to a different phone key", async () => {
    const other = await generatePairKeypair();
    const client = harness([() => sealed(other.publicKey, JSON.stringify(code))]);
    await expect(run(client).promise).rejects.toMatchObject({ kind: "invalid" });
  });

  it("maps denied, expired and delivered states", async () => {
    await expect(run(harness([() => ({ state: "denied" })])).promise).rejects.toMatchObject({
      kind: "denied",
    });
    await expect(run(harness([() => ({ state: "expired" })])).promise).rejects.toMatchObject({
      kind: "expired",
    });
    await expect(run(harness([() => ({ state: "delivered" })])).promise).rejects.toMatchObject({
      kind: "expired",
    });
  });

  it("gives up after the polling window", async () => {
    let time = now;
    const client = harness(Array.from({ length: 200 }, () => () => ({ state: "pending" })));
    const { promise } = run(client, {
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
    });
    await expect(promise).rejects.toMatchObject({ kind: "expired" });
    expect(vi.mocked(client.getPairRequest).mock.calls.length).toBe(120);
  });

  it("stops on cancel without polling again", async () => {
    const controller = new AbortController();
    const client = harness([
      () => {
        controller.abort();
        return { state: "pending" };
      },
    ]);
    await expect(run(client, {}, controller.signal).promise).rejects.toMatchObject({
      kind: "cancelled",
    });
    expect(client.getPairRequest).toHaveBeenCalledTimes(1);
  });

  it("treats a missing endpoint as unavailable and tolerates transient poll errors", async () => {
    const missing: AccountPairingClient = {
      createPairRequest: vi.fn().mockRejectedValue(new AccountApiError(404, "not_found", "x")),
      getPairRequest: vi.fn(),
    };
    await expect(run(missing).promise).rejects.toMatchObject({ kind: "unavailable" });
    const client = harness([
      () => {
        throw new Error("offline");
      },
      (key) => sealed(key, JSON.stringify(code)),
    ]);
    await expect(run(client).promise).resolves.toEqual(code);
  });

  it("never replaces a saved pinned computer with a different lanKey but accepts an extra HTTPS route", () => {
    const saved = { environmentId: "env-1", lanKey: "a".repeat(43) } as MobileMachine;
    expect(() => assertPinUnchanged({ ...code, lanKey: "b".repeat(43) }, [saved])).toThrow(
      AccountPairingError,
    );
    expect(() => assertPinUnchanged(code, [saved])).not.toThrow();
    expect(() => assertPinUnchanged({ ...code, lanKey: saved.lanKey }, [saved])).not.toThrow();
    expect(() =>
      assertPinUnchanged({ ...code, lanKey: "b".repeat(43) }, [
        { environmentId: "other", lanKey: "a".repeat(43) } as MobileMachine,
      ]),
    ).not.toThrow();
  });

  it("asks for confirmation only for a computer that is not saved yet", () => {
    expect(needsNewComputerConfirmation(code, [])).toBe(true);
    expect(needsNewComputerConfirmation(code, [{ environmentId: "other" } as MobileMachine])).toBe(true);
    expect(needsNewComputerConfirmation(code, [{ environmentId: "env-1" } as MobileMachine])).toBe(false);
  });

  it("reports a request deleted mid-poll as gone, not unavailable", async () => {
    const client = harness([
      () => {
        throw new AccountApiError(404, "not_found", "x");
      },
    ]);
    await expect(run(client).promise).rejects.toMatchObject({ kind: "gone" });
  });

  it("binds the AAD exactly as the desktop does", () => {
    expect(accountPairAad("r", "p", computer)).toBe("bycoda-pair|r|p|desk-1|env-1");
  });
});
