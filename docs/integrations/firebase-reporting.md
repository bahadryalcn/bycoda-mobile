# Firebase content reporting

The mobile client is prepared for an owner-operated Firebase HTTPS receiver.
It does not initialize a Firebase SDK, create an account, provision a service,
or send reports while `expo.extra.reporting.endpoint` is null. Email is not
the content-report delivery mechanism.

## Client contract

Configure `expo.extra.reporting.provider = "firebase"` and the deployed HTTPS
endpoint in the release configuration after verifying the receiver. The adapter
uses a regular [HTTP function](https://firebase.google.com/docs/functions/http-events)
(`onRequest`), not the callable `onCall` protocol.

POST JSON:

```json
{
  "version": 1,
  "requestId": "client-generated-uuid",
  "reason": "privacy",
  "description": "User-reviewed description",
  "excerpt": "Only present when explicitly selected"
}
```

The reason is one of `unsafe`, `hate`, `sexual`, `privacy`, or `other`.
Description and excerpt limits are 2,000 and 4,000 Unicode code points.
No transcript, host credentials, computer address, session identifier, device
identifier or application logs are added. Consent is required and content edits
reset it. Drafts remain in memory only.

A successful response must be a 2xx JSON receipt:

```json
{ "requestId": "same-client-generated-uuid", "reportId": "durable-report-id" }
```

The report ID must contain 1–128 ASCII letters, digits, underscores or hyphens.
A 2xx without a matching receipt is uncertain delivery, not success. The client
retains the draft and request ID for an explicit retry; it never retries in the
background. Editing the report creates a new identity. Requests omit cookies,
reject redirects and time out after 20 seconds. No host credential is reusable
as Firebase authentication.

The confirmation shows the report reference. Choosing **Done** acknowledges
that receipt. The next visit opens a blank report form.

## Receiver and release work

Before enabling the endpoint:

1. Deploy the owner-selected Firebase project/region and HTTPS function.
2. Validate method, content type, schema, reason, Unicode limits and request ID.
   Reject unknown metadata; do not log request bodies.
3. Atomically store the report and receipt (for example in a Firestore
   transaction). Repeated request IDs with identical payloads return the original
   receipt; a different payload under the same ID must fail. A timeout can occur
   after storage, so this is mandatory for safe retries.
4. Deny public client reads/writes to the report collection; only the receiver
   and authorized moderation operators may access it. Set rate limits, abuse
   protection, retention and deletion procedures. Add owner-selected
   authentication/App Check with its matching mobile integration before requiring
   those headers; no secret may be embedded in app configuration.
5. Configure web CORS for the actual allowed origins if web reporting is offered.
6. Publish the actual data destination/retention disclosures, staff the moderation
   workflow, then verify delivery, rejection, timeout/retry and receipt behavior
   against the deployed service on native devices.

The [receiver source](../../services/content-reporting/firebase.json) has its own
Firebase deploy boundary. It accepts only App Check tokens issued for the
explicit `REPORT_ALLOWED_APPS` Firebase app IDs and takes `REPORT_REGION` and
`REPORT_RETENTION_DAYS` at deployment. Configure the Firestore TTL policy for
`contentReports.expiresAt` and verify deny-by-default client access before
deploying. Run `npm ci` and `npm test` from its `functions` directory.

Keep the client endpoint unset until the native App Check token integration,
Firestore rules, moderation workflow and end-to-end delivery have been verified.
Firebase push notifications/FCM are a separate integration. Report delivery does
not register push tokens or change notification permissions.
