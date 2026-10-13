import { describe, expect, it, vi } from "vitest";
import { redeemMobilePairingCode } from "./pairing-redeem";
import type { MobilePairingCode } from "./pairing-code";
import type { PairingRedeemResult } from "./connection-types";

const now = Date.parse("2026-10-11T12:00:00.000Z");
const code: MobilePairingCode = {
  kind: "bycoda.mobile-pairing",
  version: 1,
  endpoint: "https://pc.example",
  environmentId: "pc-environment",
  name: "Work PC",
  ticket: "t".repeat(43),
  expiresAt: new Date(now + 60_000).toISOString(),
};
const claim = "c".repeat(43);
const result: PairingRedeemResult = {
  deviceId: "fixture-phone",
  token: "d".repeat(43),
  environmentId: code.environmentId,
};
const reply = (value: unknown = result) =>
  new Response(JSON.stringify({ result: value }), { status: 200 });
const access = () => {};

describe("short-lived mobile QR redemption", () => {
  it("uses only the dedicated HTTPS endpoint, no redirects or ambient credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply());
    await expect(
      redeemMobilePairingCode(code, claim, "Bycoda phone", {
        fetchImpl: fetcher,
        assertAccess: access,
        now: () => now,
      }),
    ).resolves.toEqual(result);
    const [address, request] = fetcher.mock.calls[0];
    expect(address).toBe("https://pc.example/mobile/pairing/redeem");
    expect(request).toMatchObject({
      method: "POST",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
    });
    expect(request?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(request?.body))).toEqual({
      version: 1,
      environmentId: code.environmentId,
      ticket: code.ticket,
      claimId: claim,
      deviceName: "Bycoda phone",
    });
  });

  it("allows an owner retry to reuse the same claim after a lost response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("Response lost."))
      .mockResolvedValueOnce(reply());
    const options = { fetchImpl: fetcher, assertAccess: access, now: () => now };
    await expect(
      redeemMobilePairingCode(code, claim, "Bycoda phone", options),
    ).rejects.toMatchObject({ kind: "network" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(redeemMobilePairingCode(code, claim, "Bycoda phone", options)).resolves.toEqual(
      result,
    );
    const firstBody = String(fetcher.mock.calls[0][1]?.body);
    const secondBody = String(fetcher.mock.calls[1][1]?.body);
    expect(firstBody).toBe(secondBody);
  });

  it("does not issue any request for an expired code", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      redeemMobilePairingCode(code, claim, "Bycoda phone", {
        fetchImpl: fetcher,
        assertAccess: access,
        now: () => now + 60_000,
      }),
    ).rejects.toMatchObject({ kind: "expired" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a returned credential for a different environment", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(reply({ ...result, environmentId: "another-computer" }));
    await expect(
      redeemMobilePairingCode(code, claim, "Bycoda phone", {
        fetchImpl: fetcher,
        assertAccess: access,
        now: () => now,
      }),
    ).rejects.toMatchObject({ kind: "identity" });
  });

  it("does not expose an accepted reply after the app has locked", async () => {
    let unlocked = true;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      unlocked = false;
      return reply();
    });
    await expect(
      redeemMobilePairingCode(code, claim, "Bycoda phone", {
        fetchImpl: fetcher,
        now: () => now,
        assertAccess: () => {
          if (!unlocked) throw new Error("Locked.");
        },
      }),
    ).rejects.toMatchObject({ kind: "access" });
  });

  it("cancels before sending when the owner already closed the scanner", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      redeemMobilePairingCode(code, claim, "Bycoda phone", {
        fetchImpl: fetcher,
        assertAccess: access,
        now: () => now,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: "aborted" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects oversized streamed responses and malformed keys", async () => {
    const oversized = vi.fn<typeof fetch>().mockResolvedValue(new Response("x".repeat(8_193)));
    await expect(
      redeemMobilePairingCode(code, claim, "Bycoda phone", {
        fetchImpl: oversized,
        assertAccess: access,
        now: () => now,
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
    const invalid = vi.fn<typeof fetch>().mockResolvedValue(reply({ ...result, token: "bad" }));
    await expect(
      redeemMobilePairingCode(code, claim, "Bycoda phone", {
        fetchImpl: invalid,
        assertAccess: access,
        now: () => now,
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("does not expose untrusted failure bodies", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Secret: " + result.token, { status: 409 }));
    await expect(
      redeemMobilePairingCode(code, claim, "Bycoda phone", {
        fetchImpl: fetcher,
        assertAccess: access,
        now: () => now,
      }),
    ).rejects.toMatchObject({ kind: "used", message: "used" });
  });

  it("aborts an in-flight claim and does not replay it", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_address, request) =>
        new Promise((_resolve, reject) => {
          request?.signal?.addEventListener("abort", () => reject(new Error("Aborted.")), {
            once: true,
          });
        }),
    );
    const pending = redeemMobilePairingCode(code, claim, "Bycoda phone", {
      fetchImpl: fetcher,
      assertAccess: access,
      now: () => now,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: "aborted" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("times out an unanswered claim without replaying it", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_address, request) =>
        new Promise((_resolve, reject) => {
          request?.signal?.addEventListener("abort", () => reject(new Error("Aborted.")), {
            once: true,
          });
        }),
    );
    try {
      const pending = redeemMobilePairingCode(code, claim, "Bycoda phone", {
        fetchImpl: fetcher,
        assertAccess: access,
        now: () => now,
        timeoutMs: 10,
      });
      const assertion = expect(pending).rejects.toMatchObject({ kind: "timeout" });
      await vi.advanceTimersByTimeAsync(10);
      await assertion;
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls default fetch with its native global receiver", async () => {
    const fetcher = vi.fn(function (this: unknown, ..._args: Parameters<typeof fetch>) {
      if (this !== globalThis) throw new TypeError("Illegal invocation.");
      return Promise.resolve(reply());
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      await expect(
        redeemMobilePairingCode(code, claim, "Bycoda phone", {
          assertAccess: access,
          now: () => now,
        }),
      ).resolves.toEqual(result);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
