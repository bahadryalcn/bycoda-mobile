const callbackAddresses = new Set([
  "/sso-callback",
  "/sso-callback/",
  "bycoda://sso-callback",
  "bycoda://sso-callback/",
  "bycoda:///sso-callback",
  "bycoda:///sso-callback/",
]);

/** Clerk's native SSO return is an SDK event, not an application destination. */
export function isAccountCallbackPath(path: string): boolean {
  // Compare exact addresses: URL normalization must not admit another host or path.
  return !/[\u0000-\u0020\u007f]/.test(path) && callbackAddresses.has(path.split(/[?#]/, 1)[0]);
}
