import { describe, expect, it } from "vitest";
import { AccountApiError } from "../account/contracts";
import {
  accountComputersRead,
  isComputerOnline,
  isComputersUnavailable,
  retryAccountComputers,
  routeKinds,
  savedComputerFor,
} from "./account-computers";
import type { MobileMachine } from "@/remote/types";

describe("account computers", () => {
  const now = Date.parse("2026-11-09T12:00:00.000Z");
  it("keeps a loaded list through a failed refresh and reports only a first-load failure", () => {
    const failure = new AccountApiError(500, "internal", "x");
    const items = [{ lastSeenAt: new Date(now).toISOString() }] as never[];
    expect(accountComputersRead({ items }, failure, now)).toEqual({ kind: "ready", computers: items });
    expect(accountComputersRead(undefined, failure, now)).toEqual({ kind: "error", error: failure });
    expect(accountComputersRead(undefined, new AccountApiError(404, "not_found", "x"), now)).toEqual({ kind: "hidden" });
    expect(accountComputersRead({ items }, new AccountApiError(404, "not_found", "x"), now)).toEqual({ kind: "hidden" });
    expect(accountComputersRead(undefined, null, now)).toEqual({ kind: "loading" });
  });
  it("retries a dropped or overloaded read quietly, never a refused one", () => {
    expect(retryAccountComputers(0, new Error("offline"))).toBe(true);
    expect(retryAccountComputers(1, new AccountApiError(503, "internal", "x"))).toBe(true);
    expect(retryAccountComputers(1, new AccountApiError(429, "rate_limited", "x"))).toBe(true);
    expect(retryAccountComputers(2, new Error("offline"))).toBe(false);
    expect(retryAccountComputers(0, new AccountApiError(401, "unauthorized", "x"))).toBe(false);
    expect(retryAccountComputers(0, new AccountApiError(404, "not_found", "x"))).toBe(false);
  });
  it("is online only when seen within three minutes", () => {
    expect(isComputerOnline({ lastSeenAt: new Date(now - 179_000).toISOString() }, now)).toBe(true);
    expect(isComputerOnline({ lastSeenAt: new Date(now - 181_000).toISOString() }, now)).toBe(false);
    expect(isComputerOnline({ lastSeenAt: "nonsense" }, now)).toBe(false);
  });
  it("treats an old API as unavailable but surfaces other failures", () => {
    expect(isComputersUnavailable(new AccountApiError(404, "not_found", "x"))).toBe(true);
    expect(isComputersUnavailable(new AccountApiError(500, "internal", "x"))).toBe(false);
    expect(isComputersUnavailable(new Error("offline"))).toBe(false);
  });
  it("derives route kinds and the saved match", () => {
    expect(
      routeKinds({
        routes: [
          { endpoint: "http://192.168.1.2:1", lanKey: "k".repeat(43) },
          { endpoint: "https://a.ts.net" },
        ],
      }),
    ).toEqual({ lan: true, tailscale: true, public: false });
    const saved = { environmentId: "env-1" } as MobileMachine;
    expect(savedComputerFor({ environmentId: "env-1" }, [saved])).toBe(saved);
    expect(savedComputerFor({ environmentId: "env-2" }, [saved])).toBeUndefined();
  });
});
