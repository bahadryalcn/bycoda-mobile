import { describe, expect, it } from "vitest";
import { TimeoutError } from "../../../../../src/shared/lib/withTimeout";
import { AccountApiError, AccountRequestTimeoutError } from "../contracts/errors";
import { PushTokenError } from "../../push/push-token-error";
import { accountPushMessage, accountReadMessage, needsReregistration, registrationMessage } from "./account-error-copy";

const copy = (_tr: string, en: string) => en;

describe("account notification error copy", () => {
  it("names a build without push setup instead of showing the native text", () => {
    const error = new PushTokenError(new Error("Default FirebaseApp is not initialized in this process com.bycoda.mobile"));
    expect(error.message).toContain("FirebaseApp");
    expect(accountPushMessage(error, copy)).toBe(
      "This app build is not set up for remote notifications. Install a build made with push notification support.",
    );
    expect(accountPushMessage(new PushTokenError(new Error("no valid “aps-environment” entitlement string found")), copy))
      .toContain("not set up for remote notifications");
  });

  it("asks for a connection check when the token request itself failed", () => {
    expect(accountPushMessage(new PushTokenError(new Error("SERVICE_NOT_AVAILABLE")), copy)).toMatch(/notification token\. Check the internet connection/);
    expect(accountPushMessage(new TimeoutError("Notification token", 15_000), copy)).toBe("The notification service took too long to respond.");
  });

  it("tells account refusals and missing records apart", () => {
    expect(accountPushMessage(new AccountApiError(403, "forbidden", "Push notifications are not enabled for this account"), copy))
      .toBe("Push notifications are not enabled for this account.");
    const missing = new AccountApiError(404, "not_found", "Device not found");
    expect(accountPushMessage(missing, copy)).toBe("This phone's account registration was not found. Retry to register it again.");
    expect(needsReregistration(missing)).toBe(true);
    expect(needsReregistration(new AccountApiError(500, "internal", "x"))).toBe(false);
  });

  it("separates an unreachable service from a rejected session", () => {
    expect(accountPushMessage(new TypeError("Network request failed"), copy)).toMatch(/could not be reached/);
    expect(accountReadMessage(new AccountRequestTimeoutError(20_000), copy, "fallback")).toMatch(/could not be reached/);
    expect(accountReadMessage(new AccountApiError(401, "unauthorized", "x"), copy, "fallback")).toMatch(/did not accept your session/);
    expect(accountReadMessage(new AccountApiError(500, "internal", "x"), copy, "fallback")).toBe("fallback");
  });

  it("points the device limit at the Account screen when shown elsewhere", () => {
    const limit = new AccountApiError(409, "conflict", "Device limit reached (10). Sign out another device first.");
    expect(registrationMessage(limit, copy)).toMatch(/below/);
    expect(registrationMessage(limit, copy, "elsewhere")).toMatch(/on the Account screen/);
  });
});
