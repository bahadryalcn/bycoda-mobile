# Bycoda mobile

When an older project ID points to the same folder as a session's current project, the app verifies both visible project records through read-only responses from the original Host, then opens the same session using its current project ID. A project mismatch is not reported as a changed computer. If folder equivalence cannot be proved, the session stays hidden and offers an explicit **Open in the session’s project** action only while both projects remain visible. No folder is registered and no message is sent during this recovery.

The Expo application in `mobile/` controls existing Bycoda Hosts on Windows,
macOS and Linux. Agent processes, files, Git repositories and scheduled work stay
on the computer. The phone has no local agent runtime or local project checkout.

Bottom navigation uses a floating icon dock for Projects, Sessions, Inbox, Tools
and Settings. A dot marks the current tab; Sessions shows its running count.
The plus button opens New session; hold it for quick actions. On narrow screens
or with large text, More opens the remaining destinations. The sheet closes when
the window fits all destinations. In **Settings →
Customize tabs**, switches control which tabs appear, and the grips change their
order. Changes apply immediately. If you change the layout, **Use default tab
layout** restores the original order and visibility. Screen readers retain
full destination names and running-count descriptions. The dock hides while the
keyboard is open.

### Tablets

A tablet window at least 960 points wide (landscape) replaces the dock with a
left rail and shows sessions side by side: the session list on the left,
ordered by urgency (needs input or failed, then running, then the rest), and
the selected conversation on the right. Selecting another session swaps the
conversation in place. Without a selected session, Sessions shows running,
attention and computer counters with the sessions that need attention. In
portrait or a narrower multitasking window, tablets keep the dock and a
conversation's header button opens the same urgency-ordered list. If a lost
connection prevents both panes from loading, the split view shows one notice.
When the notice offers **Retry**, it retries both affected panes.
If the computer connection changes while the portrait session picker is open,
the picker shows the connection change. Close it and reopen the picker to see
the current computer’s sessions.

## Read and control your workspace

When changing the **Working folder** from Files or Changes, bycoda saves any
open draft before switching. If the save fails, the picker stays open with the
error and the current folder remains selected.
When pairing updates the connection, the project opens at its main folder and
closes any file preview from the previous connection. Choose the previous worktree
again to access its saved drafts.

The Sessions tab opens with **Recent sessions**. Pick **All time** in the time
filter to include older conversations. When the recent list is empty and older
sessions are available, **All time** is also available directly from the list.

If a project tool opens without a visible project, use **Choose a project** to
open that same tool for a project on the connected computer.

**Settings → Chat** contains the send behavior for busy agents and voice settings.
If the phone can’t save a tab or voice preference, your choice stays on screen.
Select **Retry** to finish saving it. The notice clears once the save succeeds.

Re-pairing the computer closes the project’s **New session** form. If the previous
computer already accepted a session, open that session from its list when you
return to that computer.

Long-press a session in project lists, active sessions or search results for grouped actions: Rename, Pin, Copy link, Copy session ID, Copy conversation as text, Details, Settle, Archive and Delete. Stop appears for running sessions on supported Hosts and requires confirmation. Rename keeps its draft on failure. Conversation copy includes committed user and assistant text only, excludes tools and private internal blocks, and rejects incomplete text or exports over 256 Ki UTF-16 code units. Host permissions and session authority checks still apply.

In **Session options → Find in messages**, only the loaded transcript is searched.
Use **Load earlier messages** to search more history. Loading earlier messages
and opening a match pause live following. Scroll yourself or use **Jump to latest**
to return to normal following.

In **Work details**, the selected action stays selected while its record is
temporarily unavailable. Use **Action list** to choose another action. If a refresh
fails, the last loaded command output stays visible alongside the retry action.

In **Agents**, an independently running child opens as its own session. An open
agent’s assignment or report stays selected if its text is temporarily unavailable.
Use the reader’s close control to return to the same agent.

In **Coordination details**, **Request** and **Summary** remain available when
there are no tasks to show. If the reviewed proposal disappears, the panel shows
that it is unavailable and closes any open reader.

Terminal output has its own scrolling reader, literal line search, full-output copy
and a follow-latest control. Scrolling back pauses following. Commands stay in the
compact input dock; expand the editor for multiline commands. Leaving a tool keeps
its terminal and unsent command draft. Stop and Close still require confirmation.
If the computer cannot confirm that a terminal closed, its viewport remains and
input is paused. Use **Check status** to read the original close receipt; this
does not send another Close command. The view is released only after closure is
confirmed. This receipt is retained for the current terminal view's lifetime.

In a conversation, **Session options → Computer → Interactive terminal** opens the terminal
full screen. **Terminal actions** holds its secondary controls. On narrow
screens, swipe across the extra terminal keys above the keyboard to reach the
arrow keys. Use the keyboard button in the terminal header to show or hide the
keyboard. System Back also hides the keyboard before leaving the terminal.
To add recent terminal output to your conversation draft, choose **Attach output**
from **Terminal actions**.
When the terminal list is waiting for a connection, the screen explains the wait
and shows the create action once the list is available. Losing the phone's network
connection pauses new terminal requests until the connection returns.
If the desktop app is unavailable, open bycoda on the connected computer and
tap **Retry** to refresh the terminal list. A pending terminal operation keeps
its own status check.

Files exposes Name and Content search directly. File review keeps its full location
under Details. Git places branch identity before totals and formats counts using the
app language. Inbox descriptions and comments precede optional labels and assignees.

Management records use flat rows with expandable details. Model choices show readable
provider/model names. Existing pages reopen without stacking another copy.

Host access keeps the current phone first and offers device search for long paired
device lists. Filtering does not revoke devices or change connection authority.

## Sign in on mobile

Mobile use requires a Bycoda account. Sign in with Apple, Google, Facebook,
GitHub or an email verification code before opening computers, projects or
conversations. A build without account configuration keeps the workspace
unavailable. Privacy, terms and help remain readable from the sign-in screen.
The **Sections** menu in Privacy and Terms jumps to headings and contact links.
It is available from Settings, the welcome screen, and the provider consent prompt.
Terms also includes a **MIT license** entry.
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
If the link uses another computer, bycoda saves pending workspace drafts before
switching. If the save fails, the current computer stays selected and you can
choose the link's computer again after resolving the error.
If the computer is unpaired, **Connect a computer** opens the pairing options.
After you connect the computer, bycoda returns to the original link.
If the phone is offline, keep the link open and reconnect to Wi-Fi or mobile
data. The conversation opens automatically when it can be reached.
If **Waiting for a connection** appears, open **Manage connections** to repair
the paired computer. Returning to the link keeps the original conversation target.
For a temporary read failure, **Retry** tries the same link on the selected
computer. If an update is required, update Bycoda on that computer and reopen the link.
If the computer denies access or its identity changes, use **Manage connections**
to repair the pairing. After you connect, bycoda returns to the original link.
Opening a link does not migrate, unarchive, send a message or start an agent.

If a link points to a specific message, bycoda highlights that message when it
is available in the conversation. Existing widget links retain their computer
and project route.

Domain configuration alone does not prove installed-app acceptance. The website's
Apple association needs the real signing Team ID and bundle ID; Android association
needs the installed app's signing certificate fingerprint. Store and installation
destinations must refer to published, verified artifacts.

## Start a session from a link or the share sheet

`https://link.bycoda.codes/new/v1?prompt=<text>&project=<id>` and
`bycoda://new/v1?prompt=<text>&project=<id>` open the new-session sheet. URL-encode
the values. `prompt` is required (at most 8000 characters, no control characters);
`project` is optional (at most 256 characters) and preselects the project with that
id or exact unique name when it is visible on the active computer. Other parameters
make the link invalid and it opens the session list only. The prompt is placed in the
composer draft of the new session; nothing is sent, and an existing draft is never
replaced. Starting the session is still your choice in the sheet, and closing the
sheet discards the prompt shown there. If the computer reconnects with new
pairing details, choose the project again. A share that arrives after you select
**Start session** stays queued with the earlier content for another explicit start.

Sharing text, a link, images or files to bycoda from another app (iOS share extension,
Android share target) works the same way: the content is queued for the new-session
sheet and arrives as the draft text and composer attachments, never sent
automatically. On Android, choose multiple PDFs or images in Files to add
them to the same draft. Android `content://` files are copied into the app cache first.
On iOS, Safari can share a link when viewing a PDF. To attach the PDF itself,
save it to Files and share it from there.
Tap an attached file in the draft to open its preview. For formats without an
in-app preview, use **Share / save** to open the file in another app. Android
shows the document's filename and extension in the share sheet. Closing the
preview keeps the attachment in your draft.

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

The composer shows the selected model. At narrow widths or larger text sizes,
the model can use its own row. Open the picker to check the reasoning setting.

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

Application lock starts off on a new install; turn it on under **Settings → Secure
access** (it needs a configured passcode or biometrics). Unlock uses the device's strong biometric authentication or passcode.
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
different host IDs remain distinct even when names or folders match. When you
switch or re-pair a computer, open project panels close. Open project details,
tools or the working-folder picker again on the current computer. Projects
pinned on the desktop rail stay on top (their own **Pinned** section in grouped
view); running sessions never reorder projects. As on the desktop, session lists
leave out internal orchestration workers, and a project's session list leaves
conversations owned by a crew run to **Crews**.

## Phone permissions

Open **Settings → Phone permissions** to inspect camera, microphone and notification access.
Opening **Scan QR code** requests camera access the first time. A denied request
can be retried; a permanent denial offers phone settings. When you return from
phone settings, the camera waits for a fresh permission check. You can paste the
pairing code if the camera is unavailable. Photo and document
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

After you tap a notification, bycoda waits for the app to unlock and its saved
computers to load before opening the original destination.
If Android or iOS delivers an already handled tap again, bycoda keeps the current
screen. A newer notification can still open its destination.

With notification access allowed, the phone registers an Expo push token with
the active computer (Hosts that advertise `push.expo.v1`). The computer then
notifies the phone, even while the app is closed, when a conversation waits for
an approval or answer, finishes, or fails. **Computer notifications** under
Phone permissions turns this off or chooses the moments; **Send a test from the
computer** checks the whole path. Each paired computer is registered when it is
the active computer; revoking the phone's pairing on the computer stops its
notifications.

If the notification service takes too long to respond, choose **Retry** in
**Notifications from your computer**. **Test on this phone** remains available
while the phone has notification permission.

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

In **Help & support**, **Open email app** uses the device's email handler.
If the handler cannot open, choose **Copy support address**.

Use **Report** on an AI answer, or **Settings → Help & support → Report AI
content**, to review a description and an optional excerpt. Reports use the
Firebase HTTP adapter described in [Firebase reporting](../integrations/firebase-reporting.md).
The service is unavailable until a verified endpoint is configured. No mail app
is opened. If delivery cannot be confirmed, **Retry** keeps the in-memory draft
and resubmits the same request. A matching server receipt clears the draft and
shows its reference. No excerpt is included without choosing it.

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
Tap a saved computer in the machine picker to switch. In **Manage computers**,
open a saved computer and tap **Use computer**. Check its connection status, then
go back to the workspace. Each computer keeps its selected project.
Re-pair a revoked credential through **Settings → Manage computers → Edit
connection**. Removing a connection forgets it on the phone. Revoke the device
on the host to remove its authorization.

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
- **Changes:** expand staged and unstaged files independently to inspect diffs
  or stage and unstage files. Tap the wand inside the commit message field to
  generate a suggestion on the connected computer. Review it before applying it
  to your draft.
  Destructive Git actions and publication have explicit controls
  and confirmations; opening Changes never performs them automatically.
- **Inbox:** host approvals, questions, task reviews, failed work
  and linked PR watches. Social attention items the host sends are not shown on the phone. The provider inbox uses the connected desktop's existing
  GitHub, GitLab, Azure, Linear and Jira integrations for supported lists,
  details and discussions. Provider credentials stay in the desktop's credential
  store. Explicit comment and PR actions run through the active desktop bridge.
  When the desktop is unavailable, the provider view reports that state while
  host attention remains accessible.
  Clear an unsuccessful search with **Clear search** to keep the selected
  filters. The provider list's **More actions** menu contains Jira boards for
  the selected project.
- **Manage:** tasks, goals, automations and notes. Social media management stays a
  desktop feature; the phone only follows the computer. Notes use the
  existing desktop note database and reject saves after concurrent edits. A
  missing desktop database is an error, not an empty notebook.
  The Notes library and session Notes show plain-text excerpts. Opening a note
  shows its original Markdown. In the library, swipe a row or open its **More
  actions** menu to review deletion. The library menu contains **Recover unsaved draft**.
- **Settings:** open the focused controls for appearance, data saver and how chat
  sends to a running agent. In **Computer settings**, adjust concurrent tasks with
  the plus and minus buttons. Hold either button to keep changing the limit.
  Daily agent time offers presets and accepts a custom value.

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
from this source. When `inbox.list` names `unavailableProjectIds`, the Attention
list stays usable, shows a warning with the existing retry and never reports
itself empty; hosts without the field read as complete. Provider inbox also requires the matching desktop heartbeat.
The existing local update coordinator owns host installation. Building source
or exporting a web preview does not install that host, prove physical-device
behavior, sign an app-store build or verify platform account authorization.

## Privacy, first use and store releases

The welcome, secure unlock and pairing entry points provide access to privacy,
terms and connection help before a computer is connected. The lock screen opens
these documents in portrait or landscape and returns to the locked screen when
you close them. The offline example tour at `/demo` uses fictional, read-only content;
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

Feature identity glyphs at 20dp and larger use a shared duotone vector style: one theme tint, an opaque foreground and a 35% back plane. Smaller glyphs, dense controls and inline feedback keep line icons. Project logos and saved symbols retain their identity.

The bottom navigation keeps Projects, Sessions, Inbox, Tools and Settings within
reach. Tools groups destinations by Project, Work, Communication, Development and
Computer; search also finds a group name. Settings separates preferences, access
and privacy, computer controls and support.
The project filter in Tools carries into the work screens it opens, including an
explicit **All projects** selection. If the selected project is still loading or
is no longer visible, Tools opens the project picker before opening a work
screen. Each opened screen has its own filter.
When the computer is connected and project visibility still needs a sync,
the filter offers **Refresh** and explains how to sync from desktop Bycoda.

With a connected computer, tap the center **New session** action to choose a
project, or hold it for quick actions. The selected project is marked in the list.
Open the model row to choose an agent, account, and model before tapping
**Start session**. The separate project action adds a project.
Model lists use the connected computer's catalogue. A model already saved on a
session or task stays selected if it no longer appears in the catalogue.
Opening the same project or conversation again reuses its destination. Registered
projects remain independent even when one repository is stored inside another.

The project list follows the computer live over its authenticated environment stream,
including group changes and removed projects. Screens sharing the same connection share
one stream. A reconnect resumes from the last applied cursor; missing history requests a
fresh snapshot. Older Hosts and interrupted streams fall back to periodic refresh.
Expired privacy proof requires a fresh authorized read before projects become visible.
Drafts and uncertain sends are preserved; reconnect never resends them automatically.

**Settings > Appearance** opens one full-screen sheet for System, Light and Dark,
nine palettes, general typography and message text size. Text size (85–130%) and
line spacing (100–150%) use sliders; release a slider to save and apply its value.
Font family offers native System, Sans serif, Serif and Monospace choices, with
Regular, Medium and Bold weights. Code retains its monospace role. System text
scaling remains enabled. The shared-component and conversation preview reflects
saved choices. **Reset typography** resets only general size, font, weight and
spacing; theme, palette and message text size remain selected. Changes preserve
drafts and navigation. A failed save retains the chosen value and shows recovery.
**Settings > Send while agent is running** defaults to **Steer**. Hold Send to use
the alternate **Queue** action. Steer is available when the connected Host
advertises support for the provider running the turn. Otherwise Send queues the
message until the turn ends.

## Assistant and voice

Open **Assistant** from quick actions or Tools. Minimize it to continue navigating,
then return to the same Room conversation from the floating assistant window.
Drag its handle to reposition it, or expand it to return to the full conversation.
Closing the floating window ends its phone audio and active voice call. Work
already accepted by the computer may continue.

In **Assistant → Settings → Reply model**, if a change cannot be confirmed,
tap **Refresh** to read the current selection from the computer. Choose a
different model only after that check finishes.

While voice settings are open, an unsaved ElevenLabs voice ID stays with the
computer where you entered it. A connection change closes any open Whisper
model removal confirmation. If the phone cannot save a voice preference, use
**Retry** in the same settings panel.

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

On Android, iPhone and iPad, **Voice call** explicitly starts a hands-free conversation in the open
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

On iPhone and iPad the call keeps the microphone open for its whole length, so it
continues with the screen locked or the app in the background, like a phone call;
iOS shows its microphone indicator instead of a notification, and the in-app controls
(or the floating window) mute and end it. There is no picture-in-picture call window.
Outside a call, dictation and read-aloud keep using the foreground audio path.

**End voice call**, notification stop, closing the floating window, device/app lock,
sign-out or revoked access ends the call and releases phone audio. When application
lock is enabled, leaving the app stops the call even if the authentication delay
has not expired. A call does not start itself from the background. Android service
or audio interruptions (an incoming phone call, Siri) may also end it.

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
Archive keeps the conversation available through the Archive filter. In a project,
open **Project options** and choose **Archive**. Choose **Active sessions**
above the archive list to return to the project's active sessions. Delete
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
Scroll the draft details above the editor to reach additional files, notes and
links. The editor and Send stay outside that scrolling area. When the keyboard
leaves little room, open **Add to message**, then **Draft** to see those details.
In a very short area above the keyboard, Add, Send and Stop sit beside the
editor. If a note prevents sending, **Review draft** opens the draft with the
reason and the controls to resolve it. Opening the draft or attachment menu
hides the keyboard so the sheet's controls are reachable.
Long forms and operation reviews use a scrolling body with a shared action area;
errors and recovery remain beside those actions. Closing an editor retains its
existing draft or unsaved-change behavior. Use Previous and Next or swipe to
browse the welcome pages. On short screens the offline tour keeps the page text
and navigation in a scrollable view. Its sample session works without a computer
connection and has no operation authority.

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

When a saved composer draft first loads, the insertion point starts at the end.
Changing the keyboard layout keeps any selection you make in that draft.

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

Task, epic and Crew work confirmations show the record and computer. If either changes
while the confirmation is open, reopen it and review the current action.
For an unmerged review branch, **Review delivery** shows the planned merge,
including the source, target and blockers. Confirm **Approve delivery** to merge that plan.
If the Host rejects a stale plan, choose **Review again** for a fresh one.
If the connection drops before delivery is confirmed, choose **Check status**.
Bycoda can show a recorded merge without submitting another approval. A fresh
review still requires your approval before it can merge.

Single-project epics can select an Agent or saved Crew. Automations support
scheduled, continuous and event triggers; projectless automations run in Room.
With a screen reader active, closing **Choose model** returns focus to the Model
row in the task, goal, automation or steward editor.
The Epics screen shows one loading or recovery message for its task list.
Previously loaded progress stays visible if a refresh fails while access is valid.
Project scan templates retain their Steward definition, and automation history
opens the canonical Task when one exists. Tap **Show all** there to return to
the normal task list with project, search and status controls.
If the active computer changes while a linked task is open, choose the original
computer to return to that task. **New task** is available once the project scope
is verified.
Rapid taps on **Save** in the automation editor start one save. The button shows
**Saving…** until the request returns. If the result is uncertain, choose
**Check status** in the editor. The app reads the saved
settings and keeps your draft open if the result differs. Another save needs
an explicit tap after the computer reports a state that allows it.

If the computer refuses access while **Auto merge** is open, the confirmation
closes. Epic settings keeps the unsaved edits visible and disables **Save**.
Re-pairing the active computer closes open management editors on the old
connection. Open the task or epic again before editing. A confirmation from
the old connection cannot apply changes to the new one.

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

Sessions on supporting Hosts show an unread accent dot and a stronger title after new assistant output, a finished turn or a new input request. Mark as read/unread is shared across devices. Opening a visible foreground conversation marks observed activity read after a short debounce; a manual unread flag set while it is already open remains until the next opening. Metadata changes do not count as agent activity.

Snooze offers one hour, the next local 18:00, tomorrow at 09:00 and seven calendar days later at 09:00. Project and active lists keep snoozed sessions in a folded Snoozed shelf; the global Sessions filter can show them separately. Rows show the local wake time. Deadlines return sessions automatically, new input requests wake them early, and Wake now clears the deadline. Unsupported Hosts hide the attention actions. Share beside Copy link opens the native share sheet with the title and canonical session link.

In **Sessions > Filters**, tap an open dropdown again to close it. Tap a switch
or its label to change it, then tap **Apply** to update the list.


### Home-screen widgets

Active sessions shows running work, unanswered questions and recent failures, with questions first.
Medium/large widgets list sessions; small Active sessions shows counts. Needs attention shows the
first question or failure plus counts. Tap a row to open its session on its paired computer.
Question-specific navigation is not supported; the conversation opens with its existing question card.

Session titles remain opt-in. **Show question text on widgets** is a separate choice, off by default,
and requires session titles to be enabled too. Otherwise questions say **Waiting for your answer**.
Failures use safe categories from structured status, never raw error text. Unknown failures show
**Turn failed**; usage limits show **Rate limited**; interrupted sessions show **Stopped**.
Running rows show actual turn start time when available; missing timing is not inferred from edits.
Recent completed rows require observed turn timing; idle alone does not mean completed.

With notification permission and Host push enabled, updated apps receive silent widget metadata from
the paired Host. No titles or question text pass through Expo, FCM or APNs. Cached opt-in text stays
local. New sessions can use a locally known project; unknown or incomplete project directories show
refresh feedback. A newly opened question uses generic wording until the app fetches its prompt.
Changing computer, signing out or locking clears widget content. When app lock is enabled, headless
updates remain locked until the app is unlocked. Turning notifications off stops background refresh.

Background delivery depends on Android/iOS scheduling and power settings. iOS writes its shared
app-group timeline and updates an existing Live Activity only when a background notification grants
execution. Force-stopped Android apps and force-quit iOS apps cannot guarantee refresh. Expired
snapshots ask you to open bycoda; there is no direct APNs Live Activity relay. Native widget sizing,
direct Android links and background task support require a rebuilt app, alongside an updated Host.

## Waiting to send

When a message cannot reach your computer, a compatible Host keeps it in this phone's Waiting to
send outbox. Retry now reconnects immediately; Edit opens its preserved draft; Delete discards
the pending delivery. The phone retries in conversation order when the selected computer reconnects
or the app returns to the foreground. It retains your chosen model and files, and does not replay
while the app or project is locked. After 24 hours of waiting the message is held, not discarded:
it shows a notice and is sent only after you choose Retry now or Edit. An archived or deleted
conversation stops delivery, keeps the text, and lets you Edit it; a message from another account
or computer stays visible for Delete only. Older Hosts keep existing draft recovery.

## Pull requests

Open Pull requests from Inbox for all projects, or from a project header for that project's scope.
Filter by lifecycle, author or requested review and choose updated, created or oldest order. Open
a PR for description, checks, conversation, reviewer/label management and comment reactions.
Files and review provides per-file diffs and commit-bound inline comments; hiding tests preserves
drafts. Merge, squash and rebase require the reviewed head. Public writes ask for confirmation;
check uncertain outcomes in GitHub before another write. Provider lists and repository-label
discovery are bounded and disclose partial results.

## Keyboard and appearance

On a physical keyboard, Command/Ctrl+K opens the command palette, Command/Ctrl+F focuses list
search, and Command/Ctrl+Enter sends through the usual guarded action. Preferences controls whether
plain hardware Enter sends; Shift+Enter and the software keyboard keep adding newlines.
Navigation settings customize dock order and visibility; hidden destinations remain routable.

Android 12 and newer can use Material You in Appearance. A rebuilt app reads Android's system
accent and neutral tones for both native styles and shared control colors. Older binaries without
the system-colors module retain Classic. Restart the app after changing the system wallpaper to
refresh the cached dynamic palette. iOS and web retain Classic when a Material You preference is restored.
