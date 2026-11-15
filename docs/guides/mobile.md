# Bycoda mobile

When an older project ID points to the same folder as a session's current project, the app verifies both visible project records through read-only responses from the original Host, then opens the same session using its current project ID. A project mismatch is not reported as a changed computer. If folder equivalence cannot be proved, the session stays hidden and offers an explicit **Open in the session’s project** action only while both projects remain visible. No folder is registered and no message is sent during this recovery.

The Expo application in `mobile/` controls existing Bycoda Hosts on Windows,
macOS and Linux. Agent processes, files, Git repositories and scheduled work stay
on the computer. The phone has no local agent runtime or local project checkout.

## Read and control your workspace

Terminal output has its own scrolling reader, literal line search, full-output copy
and a follow-latest control. Scrolling back pauses following. Commands stay in the
compact input dock; expand the editor for multiline commands. Leaving a tool keeps
its terminal and unsent command draft. Stop and Close still require confirmation.
If the computer cannot confirm that a terminal closed, its viewport remains and
input is paused. Use **Check status** to read the original close receipt; this
does not send another Close command. The view is released only after closure is
confirmed. This receipt is retained for the current terminal view's lifetime.

Files exposes Name and Content search directly. File review keeps its full location
under Details. Git places branch identity before totals and formats counts using the
app language. Inbox descriptions and comments precede optional labels and assignees.

Management records use flat rows with expandable details. Model choices show readable
provider/model names. Existing pages reopen without stacking another copy. Sending
social drafts and campaigns still requires the applicable approval.

Host access keeps the current phone first and offers device search for long paired
device lists. Filtering does not revoke devices or change connection authority.

## Sign in on mobile

Mobile use requires a Bycoda account. Sign in with Apple, Google, Facebook,
GitHub or an email verification code before opening computers, projects or
conversations. A build without account configuration keeps the workspace
unavailable. Privacy, terms and help remain readable from the sign-in screen.
Desktop use remains available without an account.

Signing out immediately closes phone access to the Host, including its live
socket. Saved computer pairings and drafts stay on the phone for the next
sign-in. Sign-in does not replace computer pairing or provider consent.

## Open a conversation link

Links under `https://link.bycoda.codes/session/v1/` open the installed companion
through Android App Links or iOS Universal Links once the signed app and domain
association are installed. The existing `bycoda://session/v1/` addresses are also
accepted. A browser can show the installation page when the app is absent.

Sign in, unlock the app and choose the paired computer that owns the conversation. A Host
reference only offers computers with its exact environment identity. Native
references keep their original store and profile identity and are resolved by the
selected computer; an unrelated conversation with the same ID is never substituted.
The computer must advertise `sessions.references.v1`; update its Host if prompted.
Opening a link does not migrate, unarchive, send a message or start an agent.

Links citing a specific message offer **Open conversation** before opening the
full conversation; mobile does not yet jump to that cited turn. Existing widget
links retain their computer/project route and continue to work.

Domain configuration alone does not prove installed-app acceptance. The website's
Apple association needs the real signing Team ID and bundle ID; Android association
needs the installed app's signing certificate fingerprint. Store and installation
destinations must refer to published, verified artifacts.

## Crew settings

Crew working limits control parallel tasks, assignment count and duration.
Member model settings remain editable. Cost and quality estimates and the old
allocation presets are no longer part of the Host contract. Editing a crew retains
its saved model-routing choices, provider settings and revision checks.

## Usage and limits

Refresh and pull to refresh update the selected Cost, Tokens or Limits view.
Refreshing Cost or Limits keeps the token page and its reviewed time window.
Unavailable Host capabilities keep the relevant refresh action disabled.

Limits shows when the Host sampled the report. Percentages and bars both show
remaining quota. A known reset includes its date and time; an unknown reset stays
unknown. Reset credits are labeled separately from the remaining percentage,
including a known zero. Viewing or refreshing these values consumes no reset credit.

## Model and account

Open **Model and reasoning** from the conversation composer. The picker names the
provider and account even when there is only one choice. A renamed default account
keeps its name; the generic default label follows the app language.

If the saved account is no longer available, its state remains explicit. Choose an
available account before changing the model. Opening or closing the picker does
not replace the saved account. A blocked conversation keeps model controls disabled.

Recognized provider quota failures keep their original detail and point to this
picker for another account or model. The app does not switch accounts automatically
or infer when an unknown quota will reset.

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

Open the project in an Expo Go version compatible with SDK 58, or an existing
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

After signing in, open mobile **Computers** and choose **Scan QR code** directly.
The validated code selects the local-network or Tailscale route automatically;
there is no separate connection-type selection. Use **Paste pairing code** when
scanning is unavailable. Generate the code on desktop, then review the computer's name and connect. The QR holds an issuer-bound, one-time
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
different host IDs remain distinct even when names or folders match. Projects
pinned on the desktop rail stay on top (their own **Pinned** section in grouped
view); running sessions never reorder projects. As on the desktop, session lists
leave out internal orchestration workers, and a project's session list leaves
conversations owned by a crew run to **Crews**.

## Phone permissions

Open **Settings → Phone permissions** to inspect camera, microphone and notification access.
Opening **Scan QR code** requests camera access the first time. A denied request
can be retried; a permanent denial offers phone settings. Returning from phone
settings refreshes permission state without restarting the app. Photo and document
attachments use system pickers with access limited to the selected items.

Tap **Notifications** to request system notification access, then **Test
notification** to verify a local notification. Android creates its notification
channel before requesting permission. Camera, microphone and storage access are
not requested together on startup; microphone recording is not used by the QR
scanner.

The **Microphone** row shows the permission used by dictation and assistant calls.
Opening the permissions screen only reads its status. Tap the row to request
access or recover a permanent denial in phone settings; this does not start a
recording or a call. Granted access can also be reviewed in phone settings.

### Computer notifications

With notification access allowed, the phone registers an Expo push token with
the active computer (Hosts that advertise `push.expo.v1`). The computer then
notifies the phone, even while the app is closed, when a conversation waits for
an approval or answer, finishes, or fails. **Computer notifications** under
Phone permissions turns this off or chooses the moments; **Send a test from the
computer** checks the whole path. Each paired computer is registered when it is
the active computer; revoking the phone's pairing on the computer stops its
notifications.

- Nothing is sent while someone is using the bycoda desktop app on that
  computer (focused window with input in the last two minutes); its own
  banners already reach them.
- A push about the conversation on screen is listed without a banner or sound.
- Messages contain this phone's wording and the computer name only, never
  project or conversation names. Tapping one switches to that computer and
  opens the conversation.

The app is linked to the EAS project `@bahadryalcn/bycoda-mobile`
(`expo.extra.eas.projectId`). Android uses the Firebase project `bycoda-mobile`:
`google-services.json` is referenced by `expo.android.googleServicesFile`, and
the FCM V1 service account key is stored in Expo's Android credentials, not in
this repository. iOS delivery additionally needs an APNs key in the EAS iOS
credentials. Native builds made before this configuration cannot receive pushes;
without the project ID the setting reports that remote notifications are not
configured.

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

Use **Report** on an AI answer, or **Settings → Help & support → Report AI
content**, to review a description and an optional excerpt. Reports use the
Firebase HTTP adapter described in [Firebase reporting](../integrations/firebase-reporting.md).
The service is unavailable until a verified endpoint is configured. No mail app
is opened. Only a matching server receipt confirms delivery; failures preserve
the in-memory draft and retry identity. No excerpt is included without choosing it.

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

Approval replies retain the identity of the request you saw, including delegated
Crew approvals. A reused request number cannot redirect an old reply. Unsupported
Hosts or older requests without this identity show an error before a write; update
the Host, refresh the conversation or update the execution client as indicated.
An interrupted write keeps its original command identity and is checked by its
receipt rather than sent again automatically. A failed status refresh retains the
unknown hold; local sending and recovery feedback belongs to the computer whose
request was reviewed, even if the selected computer changes.
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


## Navigation and editing

The bottom navigation keeps Projects, Sessions, Inbox, Tools and Settings within
reach. Tools groups destinations by Project, Work, Communication, Development and
Computer; search also finds a group name. Settings separates preferences, access
and privacy, computer controls and support.

With a connected computer, tap the center **New session** action to choose a
project, or hold it for quick actions. The separate project action adds a project.
Opening the same project or conversation again reuses its destination. Registered
projects remain independent even when one repository is stored inside another.

**Settings > Appearance** offers nine palettes in three equal columns and equal
System, Light and Dark theme choices. Theme changes preserve the current draft.
**Settings > Send while agent is running** defaults to **Steer**. Hold Send to use
the alternate **Queue** action. Hosts without Steer support retain their supported
queue action. The composer does not expose another delivery-mode selector.

## Assistant and voice

Open **Assistant** from quick actions or Tools. Minimize it to continue navigating,
then return to the same Room conversation from the floating assistant window.
Drag its handle to reposition it, or expand it to return to the full conversation.
Closing the floating window ends its phone audio and active voice call. Work
already accepted by the computer may continue.

**Dictate message** records up to 30 seconds through the phone microphone and
uses the connected computer's local speech setup. Finish recording, review the
recognized text and send it explicitly. **Read reply aloud** uses local speech
synthesis separately. These controls require a native build containing expo-audio
and an available local voice setup on the Host; they do not bypass cloud voice's
computer-only restriction.

Manual dictation and standalone read-aloud are foreground operations: they stop
when the app backgrounds, locks or loses access. Minimizing inside the app keeps
the captured computer and Room identity. Recognized dictation is saved for its
original conversation, including while minimized. Pending recovery prevents another
recording from replacing it. A saved speech ID prevents duplicate insertion after
an interrupted save or application restart.

On Android, **Voice call** explicitly starts a hands-free conversation in the open
Room thread. It listens, sends recognized speech after a pause, reads the reply
aloud, then listens again. A call sends speech automatically; the separate
**Dictate message** control still requires reviewing and sending the draft yourself.
Starting a call requires the app to be visible and unlocked, microphone permission,
a native build with the voice companion module, and local recognition and speech
synthesis configured on the paired computer. A pending message result must be
reviewed before starting another call. An uncertain result stops the call loop
without automatically sending that utterance again.

The Android foreground service shows an ongoing voice notification with microphone
mute/unmute and stop controls. The floating window also exposes call controls;
supported devices can optionally open Android picture in picture. With application
lock disabled, an already-started call can continue outside the app while the phone
remains unlocked. Its separate connection is limited to local voice operations,
access verification and the captured assistant thread; it grants no background
workspace browsing, arbitrary commands or new approval authority.

**End voice call**, notification stop, closing the floating window, device/app lock,
sign-out or revoked access ends the call and releases phone audio. When application
lock is enabled, leaving the app stops the call even if the authentication delay
has not expired. A call does not start itself from the background. Android service
or audio interruptions may also end it. iOS background calling is not supported by
this Android flow; manual foreground dictation/read-aloud retain their own limits.

## Editing and conversation lists

Navigation labels grow with system text size and move into additional rows when
needed. Content and notifications reserve the measured navigation height. Inputs,
search and the message composer start at 48dp; icon actions retain their compact
appearance with full touch targets. Current preference values and activity dates
remain readable rather than being shortened like list previews.

Local search follows the selected application language. Clearing a template,
branch, commit or folder search returns focus to its field. Long crew identities
and reply quotations remain available in full. Validation names the affected
field, and counters use the selected language's number format.

Widget privacy settings distinguish reading, saving and unsaved choices. A failed
read keeps session titles hidden until recovery. Returning from phone settings
refreshes notification permission without requesting it again. Feedback delivery
clears only its submitted draft, preserving edits made while sending. Device
rename protects unsaved changes and blocks conflicting actions while saving.

Global **Sessions** follows desktop **Last sessions**, ordered by recent activity
across projects. Each project's **Sessions** retains its folder organization.
Both use the same compact row: provider icon before the title, project and branch
below it, with time or active status at the end. Pin state remains available in
conversation details and its accessible label. The full title remains available
to screen readers and in the conversation; the list preview uses up to two lines.
**Ready** means the session is idle, not that its work was completed successfully.

Swipe a conversation left to reveal **Archive** (or **Unarchive**), **Delete**
and **Details**. The row's **Session options** button exposes the same actions
without a gesture. Swiping only reveals controls; tap an action to use it.
Archive keeps the conversation available through the Archive filter. Delete
opens a confirmation explaining that the conversation and its history will be
permanently removed; stop a running session before deleting it.

**Details** shows the complete title, computer, project, folder, agent, model,
status and available timestamps. Created and Updated are record timestamps, not
execution duration. Older records may use their update time as the creation
time, and last activity appears only when supplied by the Host. Execution
duration is not reported by this list.

Row actions retain the computer and session you reviewed. A changed connection,
hidden project or changed session requires a fresh review before a write. An
uncertain archive or delete result blocks another write from that row; check
the session on the computer before attempting the operation again.

The message composer gives text a full-width editing row and keeps attachment,
mode and send controls together below it. Its surface stays steady while typing.
Long forms and operation reviews use a scrolling body with a shared action area;
errors and recovery remain beside those actions. Closing an editor retains its
existing draft or unsaved-change behavior. The offline tour remains sample data
and does not connect to a computer or grant operation authority.

Initial list and conversation placeholders follow the available content area.
Brief reads delay their placeholders; cached content remains visible during a
background refresh. The **Draft** marker in session lists reflects the Host's
draft state or a successfully saved local composer draft, including attachments,
a note card or a retained queue intent. Failed saves do not claim that a draft
was retained. Locked or inaccessible rows do not expose draft presence.

Images and files attached to generated messages remain visible in the transcript
instead of being hidden inside activity details. Sent-image thumbnails show the
whole image; tap to open the full-screen viewer. Missing or generic MIME types
are resolved from the filename. If an image cannot be decoded, its filename and
a retry action remain available. File reads and retries retain the current
computer, session and private-content access checks.

File links and downloaded attachments use the same reader. Images open in the
image viewer; Markdown and HTML offer preview/source modes; text and code retain
their full copyable source. PDFs render locally without a network viewer, with
page navigation, zoom, selectable text and password entry. Expanding or closing
the PDF sheet preserves its page and zoom. Corrupt files show an explanation;
**Share / save** remains a separate system handoff. Videos use the existing
native player. Office documents, archives, audio and unsupported binary formats
use **Share / save** to open in a compatible installed app; they are not rendered
as text. Unknown text extensions remain readable. The existing 20 MiB preview
limit and Host/private-content permissions still apply.

The offline PDF asset is generated from pinned PDF.js with `pnpm pdf:build`.
`pnpm pdf:check` detects stale runtime, font and character-map assets. Developer
route `/dev-files` uses synthetic local files, including encrypted and corrupt
PDFs; it has no Host or draft-writing authority.

The compact controls above the composer show working state, agents and the queue.
Elapsed time appears only when the Host supplies a valid turn start. Open the
working control for tool details or the agent control for agent details. Queued
drafts do not reset the active turn. Queue states and delivery errors remain
visible beside their controls.

An edited queued message uses its existing persistent editor, separate from the
main composer draft. **Editing queued message** reopens a parked edit;
**Cancel editing** reviews discarding that edit while retaining the original
queued message. Closing the editor parks the edit. Sending an uncertain message
still requires the existing delivery review.

Development builds expose **Workspace fixtures** from the offline tour. Demo,
Worst, Empty, One and 1000 modes exercise the actual project and session rows,
with a loading toggle. The Chat surface includes long code and failed command
output, questions, uncertain answers and approval states. These fixtures cannot
read drafts or execute Host actions.

Code and command output use compact previews with full copy and a paginated
reader. Failed commands and Host-truncated output remain marked. Questions keep
their submitted delivery state visible until the Host supplies transcript history;
an accepted command alone does not mean the provider consumed the answer. Approval
decisions remain held while sending or awaiting confirmation, preventing a second
decision for the same request. Known delivery failures retain an actionable error.

Ordinary custom questions offer **Attach file** and **Photos** for each question.
Files can answer a question without text. A reply carries up to 20 files in total,
each at most 20 MiB. Typed schema questions do not offer attachments. Upload errors
stay beside the file with retry and removal; files are uploaded through the paired
computer before the original question reply is dispatched.

Question text, files and delivery holds survive navigation and app restart. Only
a known failure permits another reply; reconnect and an accepted command do not
authorize a resend or prove provider consumption. Question attachment custody is
kept separately from disposable composer files, including when ordinary saved
drafts are cleared. Authoritative snapshots clean abandoned unsent question drafts;
sending, queued and unknown replies keep their files until ownership is resolved.

Task rows keep the session shortcut beside the task title; completion and
retained-session start/retry commands stay in the task menu. Stop, pending
operations and errors remain beside the affected task. Technical execution and
review details expand on demand. Short computer preferences use content-sized
sheets; longer editors keep their scrolling body and reserved action area.

Single-project epics can select an Agent or saved Crew. Automations support
scheduled, continuous and event triggers; projectless automations run in Room.
Project scan templates retain their Steward definition, and automation history
opens the canonical Task when one exists.

Room offers confirmed Stop and owner permission preferences, including project
scope and critical exclusions. Mobile saves the Host preference mirror only;
standing authority for native computer effects must be granted on desktop.
Room's **What I did** reads actual operation journal entries from the Host
snapshot, showing tool, target, outcome and time. It includes only records whose
project contributors are visible on this phone; message history remains separate.
Unknown outcomes remain marked and do not imply success.

Settings > Work edits the Host's canonical total and per-provider daily/monthly
token and USD caps. Blank or zero means unlimited. Saving preserves model order,
pools, role bindings and delegation, using the opening routing version to reject
concurrent edits. Unconfirmed saves require loading current settings before retry.

Crew member model source can follow the Host's crew-member role, Host model
order, a named pool, or an explicit fixed model. Saved fallback candidates are
not an allowed-model filter for automatic routing. Editing member instructions
preserves the binding; selecting a fixed model explicitly replaces that binding.
