# Bycoda mobile

The Expo application in `mobile/` controls existing Bycoda Hosts on Windows,
macOS and Linux. Agent processes, files, Git repositories and scheduled work stay
on the computer. The phone has no local agent runtime or local project checkout.

## Run the application

For development, read the [design system](../reference/design-system.md),
[coding standards](../reference/coding-standards.md) and
[UI implementation guide](../../src/ui/README.md).

Use the repository's pinned pnpm 12.8.2. Mobile has a separate workspace and
lockfile; installing it does not upgrade desktop dependencies.

```powershell
pnpm --dir mobile install
pnpm --dir mobile start
```

Open the project in an Expo Go version compatible with SDK 57, or an existing
development build. Use `pnpm --dir mobile web` to preview layout in a browser.
Real host connections use native HTTP: `/rpc` intentionally rejects browser
origins, and the preview does not persist device credentials.

## Connect a computer

In desktop **Settings → Connections**, choose **Connect phone** and the computer
to connect. The desktop checks its private HTTPS access. If needed, **Enable secure
connection** sets up Tailscale Serve through the host's actual loopback port;
it preserves existing Serve handlers and chooses a separate HTTPS port when one
is occupied. The phone must join the same private Tailscale network. HTTPS approval,
sign-in, installation and OS permission requirements are shown in the dialog.

Generate a QR code, then choose **Scan QR code** in mobile **Manage computers**.
Review the computer's name and connect. The QR holds an issuer-bound, one-time
ticket that expires after two minutes; it never contains the phone's permanent
credential. Closing the desktop dialog cancels a pending ticket. A repeated request
from the same phone can recover a lost response without issuing another credential.
The phone receives its dedicated credential over HTTPS and verifies
`environment.describe` against the QR's environment identity before saving it.
Clipboard pairing text is available when scanning is unavailable.

This flow requires a host advertising `mobile.pairing` and `mobile.access`.
Older hosts show an update requirement; connecting never replaces an active host.
Keep its service running and use the existing [local update](https://github.com/bahadryalcn/bycoda/blob/main/docs/local-update.md)
coordinator when an update is needed.

Manual HTTPS address and device-key entry remains available under **Manual
connection**. See [Remote access](https://github.com/bahadryalcn/bycoda/blob/main/docs/guides/remote-access.md) for deployment and CLI pairing.
It pins the environment identity so a changed server cannot silently become a
different computer. Native credentials live in SecureStore; saved metadata and
last selected projects contain no credentials.

On a phone with a configured passcode or biometrics, application lock starts
enabled. Unlock uses the device's strong biometric authentication or passcode.
Leaving the app immediately covers the workspace and open sheets and stops host
access and polling. **Settings → Secure access** lets you require authentication
immediately (the default), or after 30 seconds, 1, 5 or 15 minutes away. Returning
within the selected delay restores the workspace without another prompt. At or
after the delay, unlocking requires device authentication. App restarts and
**Lock now** always require authentication regardless of the delay. Unlocking
retains workspace drafts. Changing lock preferences also requires authentication.
Stored credentials remain protected by native SecureStore. A failed security
preference read keeps access locked until the read succeeds.

Android passcode authentication can be exercised in Expo Go. Face ID on iOS
requires a development build with the configured native permission; Expo Go
does not provide that acceptance path.

## Project list preferences

On **Projects**, open **View** to choose grouped or flat presentation, computer
order, natural name order or recently opened projects. Compact folder paths keep
the last two path components; **Full folder paths** restores the complete path.
Search always matches full paths and group names. Grouped view offers expand and
collapse controls, and searching temporarily opens matching groups. These choices
are saved on the phone separately for each computer and do not reorder the desktop.
The project picker shares sorting and path display preferences. Projects with
different host IDs remain distinct even when names or folders match.

## Phone permissions

Open **Settings → Phone permissions** to inspect camera and notification access.
Opening **Scan QR code** requests camera access the first time. A denied request
can be retried; a permanent denial offers phone settings. Returning from phone
settings refreshes permission state without restarting the app. Photo and document
attachments use system pickers with access limited to the selected items.

Tap **Notifications** to request system notification access, then **Test
notification** to verify a local notification. Android creates its notification
channel before requesting permission. This does not register a push token or
enable delivery of computer/session alerts while the application is closed.
Camera, microphone and storage access are not requested together on startup;
microphone recording is not used by the QR scanner.

Native configuration must be regenerated after plugin changes before building
an APK. `expo-image-picker.cameraPermission: false` blocks CAMERA globally,
including `expo-camera`; use the scanner's camera explanation for both plugins.
Inspect the final merged manifest for CAMERA and POST_NOTIFICATIONS before device
acceptance. Configuration checks alone do not prove the installed APK contains
these permissions.

## Sharing, reviews and reports

**Settings → About bycoda** shows the app version and, in a native standalone
build, its installed build number. **Share app** opens the native share sheet
with a public product or store URL. It never includes computer addresses,
pairing codes, access keys, project identities or conversations. Browser preview
displays the public URL when a native share sheet is unavailable.

**Rate app** opens the actual platform listing only after a real store URL is
configured in `mobile/app.json` under `expo.extra.engagement`. Both store URLs
are intentionally unset until registrations exist. iOS requires the assigned
numeric App Store ID; the Android listing must match `com.bycoda.mobile`. This
explicit action does not schedule review prompts or claim that a rating occurred.

Use **Report** on a completed AI response, or **Settings → Help & support →
Report AI content**, to prepare an email. The description and optional, editable
excerpt are previewed before opening the email app. No excerpt is included
without choosing it. Review and send the message in your email app; opening a
composer does not deliver a report. The draft stays in memory while the app runs
and is not a host/session log upload. Email support is available now, but does
not satisfy Google's requirement for AI reports without leaving the app.

## Prepare a native release

Run `pnpm --dir mobile check:release` for the source configuration check. This
is separate from normal development checks and does not sign, build, upload or
certify a release. `mobile/eas.json` provides an internal Android APK preview,
an iOS simulator preview, and store production profiles with Android AAB output.
Production build numbers are managed remotely by EAS with automatic increments;
the configured local values are the initial baseline. EAS account/project
registration and signing credentials are still required before using these
profiles. The mobile source is maintained in the private bycoda-mobile repository.
Clone it into the desktop checkout as `mobile/` to resolve shared contracts and assets.

The [store release guide](../reference/mobile-store-release.md) records required
privacy, reviewer, reporting, native-device and architectural evidence. Source
checks and browser previews do not establish native or store acceptance.

Add as many computers as needed. The machine strip identifies the active host.
Changing computers returns to Projects and retains that computer's selected
project. Re-pair a revoked credential through **Settings → Manage computers →
Edit connection**. Removing a connection forgets it on the phone; revoke the
device on the host if you also want to remove its authorization.

## Work from the phone

- **Projects:** open an existing folder on the computer, resume a session or
  create one with the host's available provider and model. Project workspaces
  group Sessions, Files and Changes.
- **Sessions:** read bounded transcript history, send prompts, save drafts while
  a turn is running, answer approval requests and questions, stop the current
  run, and manage session metadata. A write with an uncertain result checks its
  command receipt before any repeat attempt.
- **Files:** browse/search, create files and folders, and edit text. Saving uses
  the original content as an optimistic concurrency check; another computer's
  edit remains protected.
- **Changes:** inspect staged and unstaged diffs, stage/unstage files and work
  with branches. Destructive Git actions and publication have explicit controls
  and confirmations; opening Changes never performs them automatically.
- **Inbox:** host approvals, questions, task reviews, failed work, social threads
  and linked PR watches. The provider inbox uses the connected desktop's existing
  GitHub, GitLab, Azure, Linear and Jira integrations for supported lists,
  details and discussions. Provider credentials stay in the desktop's credential
  store. Explicit comment and PR actions run through the active desktop bridge.
  When the desktop is unavailable, the provider view reports that state while
  host attention remains accessible.
- **Manage:** tasks, goals, automations, social accounts and notes. Notes use the
  existing desktop note database and reject saves after concurrent edits. A
  missing desktop database is an error, not an empty notebook.
- **Settings:** local language and connections, and the selected host's task
  concurrency and daily agent time limits.

Social content reads the selected account's effective policy before creating or
updating a draft. Per-platform policy fields and Unicode character limits apply.
Approval, execution permission and sending remain separate owner actions.
Incoming text is content to display; it cannot change permissions or issue
instructions to the application.

## Validation and runtime boundaries

Mobile UI has one design source: `mobile/src/ui/tokens.ts` defines colors,
spacing, typography, radii and control sizes; `ui/styles.ts` defines shared
visual rules; `ui/primitives.tsx` exports the shared components. Features compose these
components and retain only their specific layouts and behavior. The older
`ui/components.tsx`, `ui/theme.ts` and screen helpers are compatibility adapters
to the same implementation, so their existing callers share the same design.

Use the shared fields, selection chips, toggles, cards, code views, error notices,
form actions, confirmation cards and sheets when adding screens. Run `check:ui`
to catch independent colors, native control copies and typography/radius values
outside the shared UI layer.

The runtime guard also prevents native code from importing desktop storage,
Tauri or Node modules. Shared desktop imports are limited to pure contracts.

Remote entities and asynchronous request status belong to TanStack Query. Shared
query feedback distinguishes initial loading, disabled queries, offline waiting,
successful empty results and failed refreshes with cached content. Mutation
feedback reports pending, failure and success beside the operation that owns it.
Writes capture their destination at submission so a computer switch cannot retarget
a pending operation or invalidate another computer's cache.

Editable forms use one `useFormDraft` snapshot for related fields. Mutually
exclusive editors, pickers and confirmations use typed flows. Derive clean values
from query data; retain an explicit local override while a user edits. Apply user
transitions in event handlers or reducers. Effects are reserved for native lifecycle,
subscriptions, cancellation and durable draft storage. `useAsyncAction` owns local
asynchronous status and prevents duplicate validation/write submissions.

Keep screens as composition boundaries. Session transcript, composer, questions
and settings are separate components; Git branches, conflicts, operations and
diffs have their own panels. Management editors and cards are feature modules.
Provider inbox jobs, query hooks, browse, detail and conversation components are
separate so durable writes do not depend on a screen's rendering code.

Shared UI implementations live in typography, layout, buttons, fields, feedback,
query-state and dialogs modules. `ui/primitives` remains their public entry point;
named component props live in `ui/component-props`. Wire types live in
`remote/contracts` by domain and resource calls in `remote/services`.
`remote/api` composes these services over one machine-bound transport. Reuse
shared desktop contracts with type-only imports and keep product code in
readable multiline form.

```powershell
pnpm --dir mobile typecheck
pnpm --dir mobile check:ui
pnpm --dir mobile test
pnpm --dir mobile export:web
```

The additive `notes.*`, `inbox.list` and provider-inbox RPCs require a host built
from this source. Provider inbox also requires the matching desktop heartbeat.
The existing local update coordinator owns host installation. Building source
or exporting a web preview does not install that host, prove physical-device
behavior, sign an app-store build or verify platform account authorization.

## Privacy, first use and store releases

The welcome, secure unlock and pairing entry points use the bycoda brand and
provide access to privacy, terms and connection help before a computer is
connected. The offline example tour at `/demo` uses fictional, read-only content;
it does not pair a computer or run host actions.

The app explains host and AI-provider data transfers before relevant use.
Removing a local computer connection and its saved drafts affects the phone;
revoke the device on its host to remove authorization, and manage host/provider
history separately.

Use [Mobile store release readiness](../reference/mobile-store-release.md) for
public policy publication, store privacy forms, native permissions/assets,
signing, device verification and reviewer access. Source preparation and the
example tour do not establish store acceptance or complete the required AI
reporting and Apple architecture review.
