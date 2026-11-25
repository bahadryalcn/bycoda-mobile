import { describe, expect, it } from "vitest";
import { identitySummary, notificationSummary, onOffSummary, permissionSummary } from "./settings-summaries";
import type { PermissionReads } from "../permissions/device-permission-status";

const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace(/\{(p\d)\}/g, (_match, key: string) => String(values?.[key] ?? ""));
const ready = (granted: boolean, status = granted ? "granted" : "denied", canAskAgain = false) =>
  ({ status: "ready", permission: { granted, status, canAskAgain } }) as const;

describe("Settings root values", () => {
  it("summarises the notification permission without leaving a pending row blank forever", () => {
    expect(notificationSummary({ status: "pending" }, copy)).toBeUndefined();
    expect(notificationSummary({ status: "error", error: new Error("timed out") }, copy)).toBe("Status unavailable");
    expect(notificationSummary(ready(true), copy)).toBe("On");
    expect(notificationSummary(ready(false, "undetermined", true), copy)).toBe("Permission needed");
    expect(notificationSummary(ready(false), copy)).toBe("Off");
  });

  it("counts allowed phone permissions once every read settled", () => {
    const reads: PermissionReads = { camera: ready(true), microphone: ready(false), notifications: ready(true) };
    expect(permissionSummary(reads, copy)).toBe("2 of 3 allowed");
    expect(permissionSummary({ ...reads, microphone: ready(true) }, copy)).toBe("All allowed");
    expect(permissionSummary({ ...reads, camera: { status: "pending" } }, copy)).toBeUndefined();
    expect(permissionSummary({ ...reads, camera: { status: "error", error: null } }, copy)).toBe("Status unavailable");
  });

  it("shows app lock state and the account identity", () => {
    expect(onOffSummary(true, copy)).toBe("On");
    expect(onOffSummary(false, copy)).toBe("Off");
    expect(identitySummary({ displayName: "Ada", email: "ada@example.com" })).toEqual({ name: "Ada", detail: "ada@example.com" });
    expect(identitySummary({ displayName: "", email: "ada@example.com" })).toEqual({ name: "ada@example.com", detail: undefined });
    expect(identitySummary(undefined)).toEqual({ name: "", detail: undefined });
  });
});
