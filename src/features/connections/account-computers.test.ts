import { describe, expect, it } from "vitest";
import { AccountApiError } from "../account/contracts";
import {
  isComputerOnline,
  isComputersUnavailable,
  routeKinds,
  savedComputerFor,
} from "./account-computers";
import type { MobileMachine } from "@/remote/types";

describe("account computers", () => {
  const now = Date.parse("2026-11-09T12:00:00.000Z");
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
    ).toEqual({ lan: true, tailscale: true });
    const saved = { environmentId: "env-1" } as MobileMachine;
    expect(savedComputerFor({ environmentId: "env-1" }, [saved])).toBe(saved);
    expect(savedComputerFor({ environmentId: "env-2" }, [saved])).toBeUndefined();
  });
});
