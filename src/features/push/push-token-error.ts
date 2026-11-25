/**
 * Apple or Google did not hand this phone a push token. The native message is kept for diagnostics;
 * screens show `pushTokenMessage` instead of it.
 */
export class PushTokenError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "PushTokenError";
  }

  /**
   * The installed build has no push setup: iOS without the `aps-environment` entitlement (a build
   * signed without push capability), or Android without its Firebase configuration. Retrying on the
   * phone cannot fix it; only another build can.
   */
  get buildMisconfigured(): boolean {
    return /aps-environment|FirebaseApp|google-services|MISSING_INSTANCEID_SERVICE|FIS_AUTH_ERROR|AUTHENTICATION_FAILED/i.test(this.message);
  }
}
