import { gunzipSync, strFromU8 } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticReportCreate } from "../account/contracts";
import { resolveWithin, runDiagnosticSend, SIGNED_IN_EMAIL_DEADLINE_MS, type DiagnosticSendDeps } from "./diagnostic-send";

const FAKE_EMAIL = "person@example.test";
const context = { appVersion: "1.2.3", platform: "android" as const, osVersion: "Android 15", channel: "stable" as const };
const gunzip = (report: DiagnosticReportCreate) =>
  strFromU8(gunzipSync(Uint8Array.from(atob(report.content.data), (c) => c.charCodeAt(0))));

function fixture(overrides: Partial<DiagnosticSendDeps> = {}, transport: Partial<DiagnosticSendDeps["transport"]> = {}) {
  const calls: string[] = [];
  const sent: DiagnosticReportCreate[] = [];
  const deps: DiagnosticSendDeps = {
    flush: () => void calls.push("flush"),
    readLog: () => "2026-11-09T10:00:00.000Z WARN  [mobile.console] fake warning",
    readCrash: () => null,
    collectHostLogs: async () => {
      calls.push("hosts");
      return { sections: [], hostVersions: [] };
    },
    environment: () => "app 1.2.3",
    email: async () => {
      calls.push("email");
      return null;
    },
    context: () => context,
    transport: {
      signedIn: null,
      anonymous: async (body) => void sent.push(body),
      ...transport,
    },
    now: () => new Date("2026-11-19T12:00:00.000Z"),
    ...overrides,
  };
  return { deps, calls, sent };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("diagnostic send pipeline", () => {
  it("opens no host connection and no account call when no account service is configured", async () => {
    const { deps, calls } = fixture({}, { anonymous: null, signedIn: null });
    await expect(runDiagnosticSend(deps, "periodic")).resolves.toBe("not-configured");
    expect(calls).toEqual(["flush"]);
  });

  it("persists the capture log before collecting hosts, then reads the email", async () => {
    const { deps, calls, sent } = fixture();
    await expect(runDiagnosticSend(deps, "periodic")).resolves.toBe("sent");
    expect(calls).toEqual(["flush", "hosts", "email"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.trigger).toBe("periodic");
  });

  it("prefers the signed-in route over the anonymous one", async () => {
    const signedIn = vi.fn(async () => undefined);
    const anonymous = vi.fn(async () => undefined);
    const { deps } = fixture({}, { signedIn, anonymous });
    await expect(runDiagnosticSend(deps, "manual")).resolves.toBe("sent");
    expect(signedIn).toHaveBeenCalledOnce();
    expect(anonymous).not.toHaveBeenCalled();
  });

  it("keeps redacting the signed-in email and secrets in the uploaded log", async () => {
    const { deps, sent } = fixture({
      readLog: () => `2026-11-09T10:00:00.000Z WARN  [mobile.console] login failed for ${FAKE_EMAIL}`,
      email: async () => FAKE_EMAIL,
    });
    await expect(runDiagnosticSend(deps, "manual")).resolves.toBe("sent");
    expect(gunzip(sent[0]!)).not.toContain(FAKE_EMAIL);
  });

  it("reports failed instead of throwing when host collection rejects", async () => {
    const { deps, sent } = fixture({
      collectHostLogs: async () => {
        throw new Error("transport exploded");
      },
    });
    await expect(runDiagnosticSend(deps, "periodic")).resolves.toBe("failed");
    expect(sent).toHaveLength(0);
  });

  it("still flushes local capture first when the upload cannot start", async () => {
    const { deps, calls } = fixture({}, { signedIn: null, anonymous: null });
    await runDiagnosticSend(deps, "crash", { includeCrash: true });
    expect(calls).toEqual(["flush"]);
  });

  it("reads the crash marker only when asked", async () => {
    const readCrash = vi.fn(() => ({ message: "boom", stack: "fake stack", occurredAt: "2026-11-09T09:00:00.000Z", appVersion: "1.2.3" }));
    const without = fixture({ readCrash });
    await runDiagnosticSend(without.deps, "periodic");
    expect(readCrash).not.toHaveBeenCalled();
    const withCrash = fixture({ readCrash });
    await runDiagnosticSend(withCrash.deps, "crash", { includeCrash: true });
    expect(readCrash).toHaveBeenCalledOnce();
    expect(gunzip(withCrash.sent[0]!)).toContain("fake stack");
  });
});

describe("signed-in email deadline", () => {
  it("returns the value when the work settles in time", async () => {
    await expect(resolveWithin(async () => "value", 1000)).resolves.toBe("value");
  });

  it("returns null when the work rejects", async () => {
    await expect(
      resolveWithin(async () => {
        throw new Error("offline");
      }, 1000),
    ).resolves.toBeNull();
  });

  it("returns null once the deadline passes and leaves no timer behind", async () => {
    vi.useFakeTimers();
    const result = resolveWithin(() => new Promise<string>(() => undefined), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the deadline timer when the work settles first", async () => {
    vi.useFakeTimers();
    await resolveWithin(async () => 1, 1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not hold the upload behind a stalled account lookup", async () => {
    vi.useFakeTimers();
    const { deps, sent } = fixture({
      email: () => resolveWithin(() => new Promise<{ user: { email: string } }>(() => undefined), SIGNED_IN_EMAIL_DEADLINE_MS).then((me) => me?.user.email ?? null),
    });
    const result = runDiagnosticSend(deps, "periodic");
    await vi.advanceTimersByTimeAsync(SIGNED_IN_EMAIL_DEADLINE_MS);
    await expect(result).resolves.toBe("sent");
    expect(sent).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
