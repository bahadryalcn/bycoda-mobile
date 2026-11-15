import { expect, it } from "vitest";
import { redirectSystemPath } from "../../../../app/+native-intent";

it.each([
  "bycoda://sso-callback?rotating_token_nonce=opaque",
  "bycoda:///sso-callback?rotating_token_nonce=opaque",
  "/sso-callback?rotating_token_nonce=opaque",
  "bycoda://sso-callback/?rotating_token_nonce=opaque",
])("ignores warm SSO navigation while Clerk finishes authentication: %s", path => {
  expect(redirectSystemPath({ path, initial: false })).toBeNull();
});

it("starts at the protected app root for a cold SSO return and discards redirect parameters", () => {
  expect(redirectSystemPath({
    path: "bycoda://sso-callback?rotating_token_nonce=opaque&redirect_url=https%3A%2F%2Fevil.test",
    initial: true,
  })).toBe("/");
});

it.each([
  "https://evil.test/sso-callback?redirect_url=https://evil.test",
  "bycoda://sso-callback.evil.test",
  "bycoda://user@sso-callback",
  "bycoda://sso-callback:443",
  "bycoda://sso-callback/extra",
  "bycoda://sso-callback/../machines",
  "/sso-callback-extra",
  "/sso-callback\n",
])("does not misclassify a foreign or ambiguous callback path: %s", path => {
  expect(redirectSystemPath({ path, initial: false })).toBe(path);
});

it.each([true, false])("preserves the full pending session identity on ordinary links, initial=%s", initial => {
  const link = "bycoda://session/v1/native/store/profile/session?turn=turn";
  expect(redirectSystemPath({ path: link, initial })).toBe(`/session-reference?link=${encodeURIComponent(link)}`);
  const widget = "bycoda://session/session?projectId=project&machineId=machine";
  expect(redirectSystemPath({ path: widget, initial })).toBe(widget);
});
