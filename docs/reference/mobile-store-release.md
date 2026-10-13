# Mobile store release readiness

This guide applies to the Expo companion in `mobile/`. The phone controls a
user-selected bycoda Host; agent processes and project files remain on the
computer. Preparing source code does not publish a privacy policy, complete store
forms, sign a binary, install a host, or establish store acceptance.

Use this checklist for each release. Recheck the linked platform requirements at
submission time and record build and device evidence outside maintained docs,
under the repository's ignored `temp/verification/` tree.

## Product and source preparation

The mobile entry points provide a branded welcome, secure unlock and computer
pairing experience. Privacy, terms and connection help must remain reachable
before pairing as well as from Settings. The `/demo` route is an offline,
read-only example tour with fictional data: it neither connects a computer nor
executes agent, Git, provider or social actions.

Source preparation also includes disclosure and explicit consent for each host
and AI provider, controls for removing a local connection and its saved drafts,
and native branding and permission configuration. Verify these capabilities in
the actual release binary; a source check or browser preview is insufficient.

- [ ] The welcome and lock screens use the existing bycoda brand, readable text,
      accessible controls and working legal/help navigation.
- [ ] English and Turkish legal information works offline and identifies the
      same app and contact used in the store listing.
- [ ] Consent explains the selected computer, third-party AI destination and
      transferred prompt/context before the relevant action; changing the host or
      provider cannot reuse unrelated consent.
- [ ] Local deletion describes its scope accurately. Removing a phone
      connection does not revoke the device on the host or delete host/provider
      history, project files or published social content.
- [ ] Example-tour content is clearly fictional, read-only and distinct from a
      connected workspace.
- [ ] App lock covers private content immediately on background/focus loss;
      configured grace periods restore access only before expiry. Cold starts,
      manual locking, failed preference storage and stale authentication results
      cannot bypass authentication. Verify all delay choices on native devices.
- [ ] Sharing contains only public product/store text and URLs. Rating is a
      deliberate user action with the actual platform listing; unset listings
      leave rating unavailable rather than substituting an invented App Store ID.
- [ ] Version/build details describe the installed binary, and Expo Go/browser
      previews are identified accurately.
- [ ] Email feedback/reporting previews its recipient and selected content,
      omits transcripts by default, retains unsent drafts and never labels an
      opened email composer as successful report delivery.

### Source configuration check and build profiles

Run `pnpm --dir mobile check:release` separately from development checks. It
validates source identifiers/version baseline, assets, QR-only permission
configuration, native privacy declarations, EAS profile settings and configured
public/store URLs. It prints unresolved listing/reporting and external evidence
requirements. Passing this command only establishes those source checks; it
does not validate signed manifests, public policy contents, account access,
report delivery, device behavior or store approval.

`mobile/eas.json` defines internal APK preview, iOS simulator preview and store
production profiles. Production uses remote EAS version counters and automatic
build-number increments; source build numbers are the initial baseline. Account
registration, a project link, signing and durable remote counters still need
setup before a build. No upload/submit action is configured. The companion source is maintained in the private bycoda-mobile repository.
Clone it into the desktop checkout as `mobile/` to resolve shared contracts and assets.

Real store URLs remain unset in `expo.extra.engagement` until their records
exist. A prelaunch build can still run all normal development and source checks.

## Privacy policy and store disclosures

Both stores require accessible in-app privacy information and a policy URL in
their submission metadata. Google requires an active public, non-geofenced,
non-PDF policy URL. Explain app/developer identity, data access and destinations,
security, retention, deletion and the privacy contact. See
[Apple privacy rules](https://developer.apple.com/app-store/review/guidelines/#privacy)
and [Google User Data](https://support.google.com/googleplay/android-developer/answer/10144311).

- [ ] Publish the mobile-inclusive [privacy policy](../guides/privacy-policy.md)
      and confirm it is readable without authentication from the exact URL entered
      in both consoles. The existing
      [repository policy URL](https://github.com/bahadryalcn/bycoda/blob/main/docs/guides/privacy-policy.md)
      must contain the release's mobile text; a local edit does not update that URL.
- [ ] Keep the bundled policy, public policy and release behavior consistent.
- [ ] Complete App Store Connect App Privacy and Google Play Data Safety for the
      shipped binary and all included SDKs. Do not preselect "Data Not Collected"
      merely because the maintainer operates no analytics backend.
- [ ] Audit optional paths too, including external images, integrations,
      user-configured endpoints and any future reporting or crash SDK.

The following is a working data-flow inventory, not a completed store form.
Google's collection definition includes off-device transmission; sharing has
specific exceptions, including certain user-initiated transfers. Apple's
definition considers access by the developer or third-party partners beyond the
time needed to service a request. Determine the appropriate answer from the
release's actual destinations, SDK behavior and retention. Consult
[Google Data Safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469)
and [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/).

| Flow                                    | Source behavior / destination                                                                                                                                          | Candidate disclosure to evaluate                                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Computer connection                     | Endpoint, display name and selected project metadata are saved on the phone; native device credentials use SecureStore and authenticate requests to the selected host. | Device/other identifiers where applicable; app functionality. Verify host logging, identifiers and retention.                                 |
| Prompts, sessions, notes and file edits | Phone drafts may persist locally; submitted content travels to the selected host. Agent context may then reach the configured AI provider.                             | Other user content/files or documents as applicable; app functionality. Evaluate each provider and retained transcript.                       |
| Repository and provider inbox work      | The host/desktop bridge accesses configured Git and issue services; provider credentials remain on the computer.                                                       | User content, messages and identifiers where applicable. Inventory the actual integration destinations.                                       |
| Social management                       | The phone controls host-managed accounts, drafts, comments, messages and scheduled work; platform tokens are held by the host.                                         | Messages, user content and account identifiers as applicable. Evaluate platform transfers and Apple's architectural restrictions below.       |
| Pairing camera                          | Camera access reads a QR code when requested; the scanner does not save or upload camera frames. The decoded code establishes the selected host connection.            | Local camera processing alone is distinct from the connection data transmitted after scanning. Verify native permission and scanner behavior. |
| Biometric/passcode unlock               | LocalAuthentication asks the operating system to authenticate; bycoda receives the result rather than biometric templates.                                             | On-device processing; verify that neither app code nor SDKs transmit biometric data.                                                          |
| Privacy/support links                   | Opening email or an external site contacts the chosen service. Any report delivery added later introduces a separate data flow.                                        | User-initiated contact and any submitted report fields; document the actual recipient and retention.                                          |

Apple requires explicit permission before relevant personal-data sharing,
including third-party AI. A generic terms acknowledgement does not replace a
clear destination-specific disclosure. See
[Apple 5.1.2](https://developer.apple.com/app-store/review/guidelines/#privacy).

## Account and data deletion

bycoda does not create a bycoda service account. Pairing authorizes a phone to
access an existing host; linking an existing provider/social account is a
different operation. Explain these distinctions in review notes and answer the
consoles according to the shipped account flows.

If account creation is introduced, implement the applicable deletion flows.
Apple requires in-app account deletion; Google requires an accessible request
path both inside and outside the app, with associated data deletion and any
justified retention explained. See
[Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
and [Google account deletion scope](https://support.google.com/googleplay/android-developer/answer/13327111).

- [ ] Verify local credential/connection/draft deletion and its failure handling.
- [ ] Document host device revocation and separate host/provider deletion steps.
- [ ] Check linked social-account disconnection and retained-record behavior.
- [ ] Do not label disconnection, pausing, archiving or hiding as account deletion.

## Native binary, permissions and assets

- [ ] Preserve QR-only camera access. The source blocks microphone and shared
      external-storage permissions; confirm the merged release manifest removes
      them and the iOS binary has no microphone usage description.
- [ ] Build with SDKs accepted by the stores. Google currently requires API 36
      or later for new mobile apps and updates; Apple requires the iOS/iPadOS 26 SDK
      or later. Recheck [Google target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
      and [Apple SDK requirements](https://developer.apple.com/news/?id=ueeok6yw).
- [ ] Resolve and inspect the release's Android manifest and iOS Info.plist.
      Camera permission must explain QR pairing. The QR scanner needs no audio
      recording; verify microphone permissions are absent. Face ID and local-network
      usage descriptions must match the actual feature. See
      [Expo Camera configuration](https://docs.expo.dev/versions/latest/sdk/camera/)
      and [Expo LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/).
- [ ] Verify denied camera permission, manual pairing fallback, backgrounding,
      biometric cancellation/passcode fallback and SecureStore failures on devices.
- [ ] Inspect icon sizing/background and adaptive-icon safe areas. Verify the
      configured splash screen in a preview or production binary: Expo Go and
      development-client splash behavior are not release evidence. See
      [Expo splash and app icons](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).
- [ ] Inspect the archive's SDK privacy manifests and required-reason API
      declarations; using Expo does not remove responsibility for third-party code.
      See [Apple third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/).
- [ ] Configure production signing, identifiers, version/build numbers and
      distribution credentials. Keep credentials outside the repository.

## Reviewer access and listing

Provide reviewers with a safe, isolated environment containing fictional
projects, conversations and integration content. Never submit a personal host's
production credentials or private workspace as review access.

Google expects reusable, always-valid access and English instructions; pairing
that requires a private network or an expiring code needs a workable review
arrangement. See [Google review sign-in requirements](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en-EN).
Apple requires functional review access; substituting a full built-in demo for
an account requires prior approval in the described circumstances. The current
read-only `/demo` tour is not evidence that full review access is satisfied. See
[Apple app completeness](https://developer.apple.com/app-store/review/guidelines/#performance).

- [ ] Prepare an accessible review host or agree an appropriate alternative
      with the store; explain pairing, app lock and all reviewable features.
- [ ] Keep review access available throughout initial and subsequent reviews.
- [ ] Supply working support/privacy URLs, accurate feature/dependency text,
      category, age/content ratings, ads declarations and export-compliance answers.
- [ ] Capture screenshots from the release's real UI with fictional data;
      include substantive workspace screens, not only welcome or splash screens.
- [ ] Test the signed build on physical iOS and Android devices, including
      representative layouts, accessibility settings and interrupted connectivity.

## AI, social and Apple architecture review

AI conversations are a central companion feature. Google's AI policy requires
an in-app way to flag/report offensive generated content to the developer and a
process that uses those reports to improve filtering/moderation. A local draft,
an offline example or a mail link that exits the app does not prove delivery.
Before Play submission, provide an actual in-app reporting destination and
moderation process, document submitted data and verify the end-to-end flow. See
[Google AI-generated content policy](https://support.google.com/googleplay/android-developer/answer/13985936)
and [its scope](https://support.google.com/googleplay/android-developer/answer/14094294).

The current implementation deliberately uses the requested email support flow:
**Report** on an AI answer or **Settings → Help & support → Report AI content**
opens a form with an optional, editable excerpt. Its email action hands a
reviewable draft to the user's mail app; it does not automatically transmit a
report or verify delivery. This is useful support functionality, but Google's
requirement above remains unresolved until actual in-app delivery and moderation
are available.

Social/inbox features can also display third-party user content. Assess reporting,
blocking and moderation requirements for the actual experience, including client
access to UGC services; do not assume that content being hosted elsewhere removes
all obligations. See [Google UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937)
and [Apple user-generated content](https://developer.apple.com/app-store/review/guidelines/#user-generated-content).

Two Apple rules need an architectural assessment before submission:

- **Remote-client classification:** 4.2.7 constrains software-specific remote
  desktop mirrors, including personal-host and LAN requirements. bycoda renders
  a native RPC interface rather than streaming a desktop screen; determine the
  applicable classification with App Review instead of claiming an exemption.
  See [Apple minimum functionality](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality).
- **Host-managed social credentials:** 5.1.1(v) restricts off-device social-token
  storage and use outside direct in-app access. bycoda's host vault and scheduled
  social operations require review against that rule; companion status alone
  does not establish acceptance. See [Apple data collection and storage](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage).

Keep the native app free of downloaded agent runtimes or dynamically executed
project code. Explain that execution occurs on the selected computer. Reassess
any future on-device execution against [Apple software requirements](https://developer.apple.com/app-store/review/guidelines/#software-requirements).

## Release blockers and evidence

Until demonstrated otherwise, submission remains incomplete without the
published mobile policy, accurate console disclosures, signing and native-build
evidence, real-device checks, suitable reviewer access, actual AI-report delivery
and moderation, and resolution of the Apple architecture questions above.

Keep implementation, local automated checks, native device behavior and store
acceptance as separate evidence. Terms or privacy text do not certify legal
compliance. A read-only example tour does not constitute store approval. Run the
focused mobile checks from [the mobile guide](../guides/mobile.md), then record
the additional release evidence for the exact signed binary submitted.
