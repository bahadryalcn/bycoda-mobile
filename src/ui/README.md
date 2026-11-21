# bycoda mobile UI

See the [mobile design system](../../docs/reference/design-system.md) and
[coding standards](../../docs/reference/coding-standards.md) for product rules.
This README owns library integration details; the design guide owns screen and
interaction rules.

Use the [UX quality contract](../../docs/reference/ux-quality.md) for layout and
acceptance, and the [component adoption map](../../docs/reference/component-adoption.md)
to select additional library structures. Catalog availability alone is not
evidence that a screen is usable or a migration is complete.

The native application uses **PanelUI Native 1.4.0**, Expo SDK 58, Uniwind 1.12,
Tailwind 4, and Reanimated 4. PanelUI is an installed MIT dependency, rather than
a visual reference. Its upstream license is retained in `vendor/panelui-native.LICENSE`.
See the [upstream installation guide](https://panelui.dev/docs/installation).

## One product API

Screens import `ui/primitives`, `ui/chat`, or their focused shared modules.
Button, IconButton, Input, Field, ToggleField, Card, typography, Badge, Alert,
Spinner, Skeleton and SegmentedControl adapt real PanelUI components. These
adapters retain application callbacks, native refs, accessibility labels,
validation, loading protection and existing state ownership. Use the same
adapters for new screens; do not create a second button or field system.

`Row` keeps its wrapping children within its available width (`minWidth: 0`,
`maxWidth: "100%"`). ScreenHeading's action group and SearchToolbar's action
group also accept horizontal shrinkage. Bound the nested group itself; limiting
only its parent does not stop intrinsic-width controls escaping left or right.

Back navigation uses `HeaderBackButton` (header-back-button.tsx) everywhere: the
root stack sets it as `headerLeft` for every native header (replacing the platform
back arrow), and in-screen headings take `onBack` on `Screen`/`ScreenList`, shown only
when no native header owns navigation. Entry flows that cancel their own state pass
`HeaderBackButton` with their callback instead of a hand-made IconButton chevron.

`Hint` adapts PanelUI Tooltip for long-press icon explanations and respects private
content access. Its trigger must forward onLongPress. Task RecordCard identity
uses one named interaction target: a short press expands details, a long press
explains status/provider/model symbols. Full provider/model values remain in the
expanded details. Stop uses a named 48dp danger IconButton beside the session and
menu actions; long press only explains it, while short press keeps confirmation.

ScreenHeading's identity keeps its intrinsic minimum on web, bounded by the
heading's full width, so a title word that fits the page is not split merely to
retain adjacent actions. Its readable flex basis also follows native font scale.
When identity and actions no longer fit together, the existing wrapping heading
places the action group on another row. Preserve this identity minimum instead
of applying the generic `minWidth: 0` row rule to it; context, native title
ownership and action availability stay in their existing owners.

A dynamic scene identity must update the navigator title from the same current,
authorized value passed to ScreenList/Screen. A fixed route fallback must not
silently replace a saved profile identity when native-title ownership suppresses
the content title. Keep its Stack.Screen options outside virtualized list
headers; an expired/denied identity falls back with the same existing access
guard, without changing the workspace/query/operation owner.

Use `StatusRow` for read-only identity/status pairs. Its label keeps an intrinsic
basis and a bounded automatic minimum; a long value moves to the next line
instead of consuming the label's reading space. Keep the existing value owner
as its child (`Badge` for availability summaries, muted `Body` for diagnostic
readings). It does not create a navigation target or an alert, change the value's
type scale, or own any operation state. Launcher, network and device preflight
rows share this layout.

ProviderCenter groups launcher metadata in one Providers disclosure before the
agent collection. Its closed detail names every unavailable/unknown launcher;
resolved launcher names are enough for the ordinary summary. Expanded StatusRows
retain the full readout and the explanation that launcher discovery does not
prove account sign-in. Keep agent search/editor and Host review owners unchanged;
do not turn optional launcher metadata into permanent top-of-screen rows or
conceal an unresolved state to make the page look quieter.

`CollectionToolbar` from search-field.tsx reserves the primary field's width and
wraps secondary actions for search or scope selectors. `SearchToolbar` delegates
to this owner while retaining its existing search-slot API. Its readable field
basis follows OS text scale; growing text may move actions to the following row.
Tasks, session overview and runtime logs place their filter trigger beside search
through this owner, leaving create/refresh/overflow in page identity actions.
Keep the existing filter state/callback owner and native-title suppression; do
not weaken the heading's intrinsic text minimum to force more commands beside it.
`FilterSheet` accepts
`applyDisabled` for incomplete staged choices; the feature owner must still check
current scope and callback identity before applying. Reset and Close remain
available. Jira stages board scope/sprint/column choices through this contract,
keeps committed scope in its summary and places page navigation after records.

Collection filter consumers use `AppliedFilters` from filter-sheet.tsx for their
committed selection summary. It is flat caption metadata, with full wrapping
labels and optional result context, not another toolbar or a truncated chip row.
The spoken label includes the filter context; visible copy omits that redundant
prefix. Pending editor choices stay in FilterSheet and never replace this summary
until Apply. Reset/Cancel, query/defaults, scope and selection remain in the
feature owner. Provider inbox combines its existing count with assigned/closed
state below SearchToolbar; task status (including the default Active), session
project/archive/status and log source/level/paused-refresh use the same pattern.
A missing log-source label falls back to its selected ID so the active constraint
remains discoverable. Do not silently clear it when the source list refreshes.

InboxScreen owns an Inbox-local presentation memory above its mode switch.
Provider-list preferences (assigned/closed, draft and committed search,
loaded batch limit and scroll offset) survive that switch. Attention has a
separate offset-only port under the same scope owner. Both modes reuse the
measured FlatList restoration hook; moving one list never overwrites the other's
position. Attention retains no record, selection or action state. Selected records,
notices, editor drafts, filter drafts and approval/operation state stay in their
existing feature owners. Inactive content unmounts; do not keep hidden queries
alive just to retain list preferences. No settings/storage key is introduced.
The canonical machine store is observed on every event. A changed reviewed
connection identity or project issues a fresh opaque generation and retires the
old memory, including batched A/B/A changes; names/theme/ordinary metadata churn
retain the current generation. Never encode transport metadata into a React key.
Scroll restoration waits for current data and measured geometry. A partial first
virtualized extent is not the final end of the list: continue after new extents
until the requested offset is reached or the actual last row/end is observed.
User scrolling or a new visible search/filter action takes priority over pending
restoration. Use stable FlatList viewability callbacks and keep standalone browse
behavior unchanged when no presentation memory is present.
Explicit access suspension preserves the target separately from measured position:
concealed rows invalidate the old visible offset even if the platform has not yet
delivered its zero-scroll event. Retire measurement/scroll callbacks on unmount and
read-window changes so delayed events cannot overwrite the other mode's memory.
Attention shares the provider collection's original-scope and private-failure
boundary. Project selection and navigation must validate the current record,
content lifetime and memory port before changing scope; the intentional project
selection may itself retire that port. Do not revalidate it after that selection
and accidentally suppress the authorized original-target route.
Attention rows place time and status in the existing wrapping `supporting` slot,
leaving the main text its readable width. Reserve `trailing` for a compact
accessory, not a metadata column that squeezes a large-text title into fragments.
Attention uses `CollectionToolbar` for project scope and the secondary
refresh/help menu, matching provider collections. Optional guidance opens a
compact shared Sheet rather than adding a permanent row before records. Its
content lease retires on access/scope changes, including old menu callbacks.
The row's spoken label includes its title, detail, time and translated status;
navigation callbacks and scope selection stay in the feature owner.
SegmentedControl's optional hideLabel suppresses only the fallback selector's
visible label where the page already supplies that context. Its accessible name,
current choice, option labels and guards remain intact; the default is unchanged.
Labels retain their text and touch targets and wrap in normal flow.

Social media management is not part of the phone app: it stays a desktop feature and
the phone only follows the computer. The phone still filters the Social attention
items the Host sends through `phoneAttentionItems` in `features/inbox`.
Conversation kind is flat metadata beside account/project/time, not a competing
trailing column; an actual review reason stays fully readable inside its row.

`NavigationRow.supporting` is for wrapping status and context below the identity;
`trailing` remains for compact accessories. Projects and both session list
families place running/opening state and time in supporting content, rather than
letting a wide status badge reduce the title to a few characters per line.
Project/group/folder disclosures keep counts and status with their identity
column. Status badges bound their contents and allow the label to wrap. Existing
row action, expanded/disabled state, search ancestry, group collapse, source path,
privacy and draft owners stay intact. The pinned folder icon uses the existing
platform-specific decorativeSvgProps; its Pinned meaning stays in the row label.

`ActionMenu` keeps secondary commands in the installed Menu/Popover rather than
adding a second Sheet owner. Its facade gives both the positioning wrapper and
visible panel the same window/safe-area height ceiling, reserving the shared
screen gutter at both edges. A cap on only the positioning wrapper leaves the
inner ScrollView unbounded. Keep the existing single menu scroller; do not add a
second scrolling region or fixed item heights. `min-h-touch` supplies the 48dp
minimum while localized labels and descriptions may grow. Window/safe-area updates
resize the same open menu without replacing the originating screen's draft.
The library still owns anchoring, edge clamping, disabled actions, selection,
Android Back and outside-tap dismissal. Native focus restoration remains with the
library. These bounds do not prove native keyboard/gesture acceptance.

`useMenuLifecycle` owns the shared open/availability and committed-choice lifetime
for every platform. Rendering no choices does not itself reset React state: an
empty or private-hidden menu must retire its open state before its trigger can
return. Retired trigger events cannot reopen or close the replacement lifetime.
A choice is accepted only while its owner is mounted/open, access is still valid,
and that same enabled item remains current under its key. Never replay an old
row or substitute a new callback under a reused resource key. Close the menu's
selection lifetime synchronously before invoking the original callback, so a
retained second event cannot dispatch again. The original callback/transport
still owns business permissions, operation uncertainty and any Sheet guard.

On web, `OverlayWebMenuContext` joins each portalled menu to the existing product
overlay focus controller; it does not add a document listener or a second Sheet.
MenuFocusScope receives the registry and private-access owner explicitly because
the upstream registry portal does not preserve arbitrary product context. The
originating trigger determines which Sheet/background owns the menu. Only that
owner's current menu may take focus; replacing its Sheet, closing its owner,
locking or revoking private access retires the menu. Conceal retired content
before React unmounts it and never restore focus to a forbidden source.

The controller keeps the menu role/name, focuses enabled items, skips disabled
commands with arrows, supports Home/End and cycles Tab within the active menu.
Keyboard movement scrolls the selected item into its bounded viewport; Sheet
restoration keeps its existing prevent-scroll behavior. Escape closes the menu
first and restores its surviving trigger. A later Escape belongs to the Sheet's
existing pending/dirty guard. Composition and already-consumed keyboard events
stay with their original control. Menu focus uses the shared visible ring token.
Do not replace this registry with per-menu global Escape listeners or treat a
menu close as authorization to discard a Sheet draft or invoke a Host action.

`HierarchyFrame` measures a virtualized cell's actual width. It budgets native
font scale, an eight-em identity measure and the consumer's real icon/gap/inset
footprint before allocating depth indentation. It never substitutes window width
for an embedded list's region. Until a positive measurement arrives, indentation
is zero; transient zero/non-finite measurements do not replace the last valid
width. Resize and appearance changes keep the same child/state owner.

Folder/session rows consume the same layout result. If indentation is compressed,
the immediate parent name stays visible with the identity. The read-only directory
projection supplies full ancestry for the accessibility label; it does not alter
host membership, order, keys or collapsed state. Source folder ancestry remains
bounded by the existing four-level Host session-layout contract. Running-session
promotion, loose-session recovery and search-only ancestor expansion retain their
existing owners. Clearing search restores saved collapse; searching does not write
new collapse choices. Type/viewport fixture proof is separate from native layout,
text scaling, gestures and accessibility acceptance.

`WorkspaceFrame` owns project and conversation header/body allocation. Its Scene View
reports the actual available height after navigator/safe-area/keyboard owners;
never subtract those vertical insets again or infer it from device height.
Header horizontal gutters use max(screen gutter, safe-area left/right), matching
the selected list's independently owned gutters. The header
ScrollView fits its content up to a measured maximum, reserving a nominal readable
input/action region for the workspace. Header and selected list/editor scroll
independently. Transient zero/non-finite frame heights retain the last positive
measurement. Feedback/context growth does not replace or key the body subtree.
The existing project tab, worktree, draft-guard and private-content owners stay
in ProjectScreen. Keep sheets outside the header's scroller.

The header budget reserves a readable input/action-sized body where space permits,
while keeping a complete control-sized header. Its minimum grows with native font
scale rather than clipping a control at 48dp. A half-height split is insufficient
when a conversation body also contains find controls: reserve useful body space
before giving long context additional height. This is measured-region allocation,
not a window-height offset or a fixed-height identity row.

SessionScreen places this frame inside SessionKeyboardFrame's already padded
viewport and sets `headerInset="none"`. The outer keyboard frame still owns the
composer footprint, IME clearance and safe-area gutters once. WorkspaceFrame
measures the remaining region; it does not subtract keyboard/composer/insets again.
SessionToolbar keeps its callbacks and portalled Sheet state. SessionTranscript
and its navigation owner stay in the same body slot; composer state stays outside
the header. Do not move either owner into the header's ScrollView.

SessionHeader puts frequent controls at the top and gives full computer/project
context its own readable width. Its measured action footprint and native font
scale determine whether status can share the control row. If not, status follows
the controls. Action children keep the same React slot as width/density changes.
Compact keyboard presentation adjusts group spacing; the measured viewport owns
the actual height allocation. Long context remains available through the bounded
header scroller instead of clipping identity text or removing useful controls.
Native keyboard animation, large-text input geometry and virtualized-list anchoring
still require device acceptance.

`ChatComposer` keeps PanelUI AIInput behind the product facade, with its keyboard
avoidance disabled because SessionKeyboardFrame already owns that geometry. The
field keeps the caller's larger numeric minimum and enforces at least 48dp; it
must not overwrite a native large-text floor with the default minimum. Selection,
value, key and focus callbacks remain with the draft owner. Its optional toolbar
layout callback reports the actual control row, including wrapping.

SessionComposer measures its prefix, recovery footer and toolbar independently.
`composerInputLimits` spends only the room left after those regions, real spacing
and the shared WorkspaceFrame reading budget. It preserves the line-sized input
floor and existing preferred growth ceiling. Do not derive chrome by subtracting
asynchronous total/field measurements, which can create a resize feedback loop.
Empty prefix/footer regions add no phantom gaps. Notes, attachments, suggestions
and recovery controls keep their existing owners; suggestions stay virtualized.
Suggestions have their own measured region. `composerSuggestionLimits` uses the
remaining keyboard-frame scene, measured notes/recovery/actions and the input
floor, rather than the full window. When space is tight, the existing leading
action becomes Close; dismissing suggestions restores Add to message without
remounting the field or changing its draft. Larger panels retain their heading
and Close button. Catalog feedback and retry stay inside the same virtualized
list scroller, so a long error cannot push the editor out of the scene. Height
changes reveal the selected option from its top, including after text growth.

The keyboard frame ignores transient zero/invalid scene layouts so concealment
cannot switch the composer back to an unrelated window-height budget.

`ComposerActionsProvider` is local to one composer. ComposerActionSlot registers
presentation nodes; ComposerActionArea draws them in AIInput.Toolbar. The store never
owns a draft, executes a callback or changes a queue lease. SessionQueue keeps its
controller, editor and Sheet state in their original feature owner. Updating a
summary reuses its control and focus; removing its owner removes its slot. Without
a provider, the same component renders its original full inline summary. Do not
move SessionQueue's stateful controller into the toolbar or mount a second queue
instance to obtain its actions.

The passive queue summary uses an ordered-list glyph and count in the composer;
its accessible label and inspection Sheet retain the full count/state. Errors,
uncertain delivery and pending confirmations keep a full visible description.
Existing recovery/editor controls remain available. The delivery selector's
accessible purpose includes Delivery mode, distinct from the primary Queue/Send
action; inspecting it must not submit the draft. Very large auxiliary regions can
still exhaust a short scene at the input minimum: preserve required feedback and
verify that state through its owner rather than hiding it or claiming native IME
acceptance from these allocation calculations.

Project context shows the active computer above its existing compact path. The
options trigger aligns at the top when the identity grows. Project feedback uses
`IssueSummary.details` for source-specific QueryState/MutationState content:
one source stays immediately visible; multiple sources share a disclosure while
retaining their own auth/identity repair and retry. Labels/counts do not replace
the detailed recovery nodes. An explicitly supplied combined retry remains
available even with structured details; no generic retry is inferred. Working
folder loading/error feedback belongs to the open working-folder picker, or to
the header when that picker is closed. Do not leave required repair behind the
modal or duplicate the same source in both owners. An inline read error does not
relax transport access, capabilities or draft guards.

`QueryState` keeps cached read failures distinct from initial loading and empty
results. Cached unsupported Host features show the existing update guidance and
compact last-received-data context, without offering an ineffective retry. Cached
network failures retain their guarded refresh action. Authentication and identity
failures keep connection repair, including the nearest Sheet stack continuation;
cache availability must not substitute a generic retry for that recovery. These
presentation rules do not authorize access to cached private content or alter
transport, privacy boundaries, query data, or caller-owned navigation.

`ui/project-icon` owns project identity: the saved desktop color, symbol and
custom logo from the privacy-filtered directory. Local logos arrive as bounded
PNG thumbnails, never desktop file URLs. Missing metadata uses a neutral folder;
groups use a layers fallback. Identity color denotes saved identity only. Running activity belongs to the
session's labelled status, never the project icon. The Projects navigation tab
uses the same folder shape with the standard selected-navigation treatment.

`SearchField` (search-field.tsx) is built on PanelUI SearchBar. It keeps the
InputProps contract and adds opt-in `debounce` and `onDebouncedChange`;
`useDebouncedSearch(query, delay)` wraps PanelUI useDebouncedValue for screens
that filter locally. Layout props go on an outer wrapper, and the field grows
with text scale.

`NumberField` (number-field.tsx) is a numeric text field on PanelUI InputGroup. It
strips non-digits, allows one optional decimal point and shows an inline unit. It
commits on every keystroke because PanelUI NumberInput commits only on blur, which
would hand Save a stale value. `CodeField` (code-field.tsx) is a fixed-length
numeric verification code on PanelUI OtpInput and keeps paste and one-time-code
autofill. Never use it for the pairing payload, which is a long encoded value.

`StateView` regions render on PanelUI EmptyState; the compact inline row stays
bycoda's. `Skeleton` takes `loading` and uses PanelUI useSkeletonHandoff: a visible
placeholder dissolves into a zero-height, pointer-inert overlay while content takes
its place. `QueryState` keeps the Skeleton mounted beside the state view for `list`
and `content` loading.

`ProgressButton` (buttons.tsx) is PanelUI progress-button. Use it for one deliberate,
hard-to-undo action: press and hold confirms it instead of a confirm dialog. Do not
use it for routine submits or operation progress. Screen readers get an immediate
activate action.

Screens and overlays handle hardware back with PanelUI `useBackHandler(enabled, onBack)`.
It always consumes the event, so gate it with focus through `useIsFocused` from
expo-router/react-navigation. Vitest cannot apply a test's react-native mock to the
upstream hook, so `vitest.config.ts` aliases it to `src/ui/back-handler-test-double.ts`.
Disclosure open state uses PanelUI useDisclosure.

The Files browser breadcrumb strip uses PanelUI ScrollFade as an overflow hint.
`SectionNavigator` (section-progress.tsx) displays localized reading progress
from PanelUI's useScrollSections and uses the shared Sheet for the jump list.
Use it after the document scroller so its action takes up layout space without
covering the final heading.

PanelUI components evaluated and not adopted:

- message-scroller: the transcript keeps LegendList for its streaming follow machine, drag/momentum tracking, alignItemsAtEnd, scroll-memory restore, scrollToKey and KEEP_POSITION prepend.
- select, combobox: their portal/BottomSheet presentation would replace security-aware Sheet routing; select is single-value.
- tag-input: no free-entry mode.
- chip: the pill cannot wrap full AppliedFilters labels.
- number-input: commits on blur.
- steps: no linear multi-step flow.
- code-block: fixed text-xs conflicts with chat text-size presets.
- response: bypasses bycoda message-content media and privacy handling.
- sources: citations are inline file links.
- thinking-orb: a continuous frame loop for a persistent pill.
- soundwave, image-generation: no voice input or image generation.
- panelside: no wide-screen layout.
- planner: goals have dependency steps, not dated milestones.
- timeline: git history rows are tappable navigation in a virtualized list.
- section-rail: a floating side overlay covers content on phones.
- support: a help-desk landing, not the report form.
- tour: anchors belong to other owners.
- sortable: task order applies only within status groups of a virtualized mixed list; the Move up/down menu stays.
- tree: the file browser is drill-in navigation.
- context-menu: rows already have a visible ActionMenu.
- week-strip: date-based, while the schedule uses a weekday enum.
- useCopyToClipboard: no single-flight or access gating.
- useKeyboard: keyboard-controller owns keyboard events.

The full upstream public API is exposed as `ui/panelui` and as the `PanelUI`
namespace in `ui/library`. `catalog.ts` indexes all **143 installed component
modules**, their roles, core bycoda use cases and optional capabilities.
`catalog.test.ts` checks the inventory against the installed package. Shared UI
implementations should import individual `panelui-native/components/...` modules
when possible. Full catalog availability does not mean every component is shown
in every product screen.

In PanelUI 1.4.0 the portal export and the Tabs `animationDisabled` context are
upstream, so `vendor/patches/panelui-native@1.4.0.patch` no longer adds them. The
patch now only adds the TabsList scroll animation gate (see below) and the aria-*
state attributes that React Native Web 0.21 does not reflect on initial render:
`aria-selected` on both tab trigger variants, `aria-checked`/`aria-disabled` on
Checkbox, Switch and RadioGroup items, Progress `aria-busy` with its numeric
range and value text, and the Slider thumb `aria-value*` attributes. It also adds a
CodeBlock `textStyle` prop, so `CodeSource` follows the chat text-size preference
instead of the fixed `text-xs`. Native state/value props remain present, with radio
selection represented by its correct `checked` state. Remove each patch part when
upstream declares the corresponding web state. The upstream MIT license is
retained alongside the patch.

The pinned patch also makes scrollable Tabs.List reveal its selected tab without
animation when the existing `disable-all` animation mode is active. Both its
source and compiled module use the same motion gate. SegmentedControl uses this
intrinsic-width list so translated and system-scaled labels can scroll intact.

The former gluestack compatibility source (`ui/gluestack`) and its exports were
removed; production screens never imported it. The offline tour lazy-loads ComponentGallery
only after the user selects Controls. Its interactive forms, attachments, chat,
plan, table and timeline examples use focused PanelUI imports and the same product
adapters. The searchable 143-module catalog provides category/priority filters,
explicit preview coverage, individual import paths and upstream documentation.
Optional native or service requirements remain visible; the tour does not connect
to a host, configure a service or send messages. Do not import the full upstream
barrel to render the gallery or add it to normal workspace startup.

## AI conversation presentation

New or invalid chat-reader preferences default to Standard. Explicitly saved
Compact, Standard and Large preferences remain intact. The message-content
facade stretches within its bubble; code and tables own horizontal scrolling
without increasing the width of the conversation.

`chat-controls.tsx` owns quiet chat chrome through `ChatToolbarAction`: small
semantic labels/icons, no persistent filled capsule, and a minimum 48dp target.
Its opt-in `hideLabel` keeps the same accessible target and callback when a
navigator accessory must yield room to the title and Back. The transcript view
filter uses this presentation on narrow or large-text windows; its spoken name
still includes the current view, and the selection sheet keeps both labels and
descriptions. Do not compact essential task actions such as Stop this way.
`ChatCircleAction` uses a 30dp visual within a separate 48dp target; the latest-message
shortcut uses its bordered surface variant and a full accessibility label.
Queue count and queued-draft access share a wrapping metadata row above the composer.
The existing queue/editor hooks retain their state, guards and transport callbacks.

`chat-composer.tsx` adapts PanelUI AIInput for the workspace composer and offline
tour. It uses a growing field in one wrapping action row, 48dp product actions and
`avoidKeyboard={false}`; `SessionKeyboardFrame` remains the keyboard owner.
Drafts, selection, suggestions, attachments, queue/steer and dispatch stay in
their existing feature owners. Native field sizing replaces the content-size
measurement feedback loop.

`chat-activity.tsx` adapts Reasoning, Task, Plan and Shimmer. The session header's
view filter defaults to messages and results: only active actions in the latest
provider turn remain transiently visible while the session is running. Detailed
view restores the original chronological history without changing stored blocks.
Quiet activity opens a virtualized list in a full-height sheet. Timeline rows
never expand tool output inside the inverted list, avoiding animation/row-height conflicts.
Selecting one action mounts only that record's output in a full-height inspector,
owned by the transcript so completion cannot dismiss an open inspector. Session
error/interruption notices and approval actions retain their visible presentation;
settled tool failures remain inspectable in Detailed view. Plan build actions keep
their remote-content and access guards. Structured task progress uses PlanSteps.
Only actual running/streaming states shimmer, with reduced motion respected.

`message-code.tsx` uses one native CodePanel/CodeText surface for every reader
preset because upstream CodeBlock fixes its code text at `text-xs`. Transcript
code has a bounded, syntax-colored preview with full-source copy and a separate
full-height reader; expansion does not change the inverted transcript row.
Expanded message and code readers use `ReaderActions` in the Sheet footer,
outside their single vertical content scroller. `ReaderActions` delegates its
layout to `ReaderActionArea`, which also presents SelectedText's quote and
translation actions. The shared area owns wrapping, pagination, status and error
placement; it does not own or copy the reader's state. SelectedText keeps its
selection count and insertion error there alongside actions; source and language
remain in the body. Copy, contextual feedback and page navigation remain
reachable after scrolling. Single-page readers omit
pagination. `useSourcePages` bounds displayed source to 12,000 UTF-16 units per
page (plus a boundary surrogate when needed), preserves every character and
clamps a removed page before source regrowth can revive it. Reading-style changes
preserve the selected page. Paged code uses faithful plain text because a page
can begin inside a lexical token; single-page code retains lexical accents.
Copy always uses the complete original payload, including metadata hidden by a
message display preference, rather than the visible page. HTML/Mermaid previews
mount only after an explicit action on a complete fence; eligibility and preview
input use the whole source, preserving the HTML size budget and resource policy.
Incomplete-code status stays in the footer. Nested previews retain the outer
Sheet context and return to its selected page. Native selection, clipboard,
Back/keyboard and large-text acceptance require device verification separately.
`useClipboardFeedback` binds its callback, error and acknowledgement to the current
payload, reader-enabled state and private access context. Expanded message/code
readers pass their open state; inline code retains its normal active copy action.
Closing/reopening, replacing content or leaving/returning to foreground access
retires prior callbacks and feedback, even when the source string later matches.
The existing private-content check and app lock/focus state are checked before the
queued native call and before accepting its result. A synchronous security
subscription retires queued work across batched lock/background/return events.
One component-lifetime single flight remains busy until an already-started OS
write settles; it cannot cancel that write or replay it for a new source. A new
copy requires explicit input after settling. Old completion never acknowledges a
new reader or replaces its current feedback. Stored source, pagination, reading
preferences and the exact clipboard payload remain in their existing owners.
Related source/path controls may inject one shared single flight without sharing
acknowledgements or payloads; each initiating control owns its own busy/error
state. ReaderActions bounds both its action and pagination groups to the footer
width so added actions wrap within the region at large text. A blocked sibling
copy control can be disabled independently of the initiating busy indicator.
Incomplete fences and explicit file/media opening retain the product contracts.


`TranscriptActions` composes flat command/navigation rows; `useTranscriptActions`
owns the opening's message and Host/project/session snapshot. Message replacement
or an observed scope A/B/A retires that opening. Complete-response copy follows
its separate live response payload without changing the message snapshot. All
copy, share, note, check and report operations share one synchronous flight;
selection cannot open during that flight. `useClipboardFeedback.inFlight` reports
an already-started write even after its payload/control is disabled. Keep that
initiating row visible and busy until settlement, and block sibling actions.
Successful copy closes only its current opening. Copy errors, share cancellation,
write errors and read-check errors remain below their initiating row. Commands
have no navigation chevron. Do not duplicate a RemoteHostError's uncertainty
instruction with a second explanatory paragraph.

The note ledger is independent of other action feedback. An uncertain write or
an issued write crossing access loss stays uncertain until an explicit read of
its original UUID. A matching ID/body receipt is required for Saved; comparison
accepts the Host's documented CR/CRLF-to-LF normalization. A failed/mismatched
check never authorizes replay. Only an authoritative null read enables an
explicit create retry with that same ID and expectedUpdatedAt=0. Both write and
check disable transport retries. Share retains its native iOS anchor; cancellation
is quiet. Report opens the existing consent/draft flow once behind its current
capability gate; it does not submit a report from this menu.

`SelectedText` retains bounded, read-only source pages and the current draft
transfer owner. Unmount, source/scope A/B/A or private access loss retires old
selection callbacks. Page, selection, language and bridge must still match when
adding a quote/translation draft; the action never sends. Each displayed page
has a distinct lifetime identity, including page A/B/A. Retire it synchronously
before scheduling a page transition. Late native selection, language and page
handlers cannot update a replacement page or revive old offsets. Paging clears
selection, rejects out-of-range requests and is disabled for a retired opening.
Single-page excerpts omit the entire pager, matching other readers. Avoid splitting CRLF
or a Unicode surrogate across raw pages. Normalize displayed page line endings
to LF before both native selection offsets and excerpt slicing, because browser
textareas normalize CRLF. This display projection does not change the full raw
message copied or saved as a note. Native selection handles and OS handoffs still
need separate device acceptance.

`HtmlPreview` supports inline `height` and bounded `fill` layouts. Full code HTML
and diagram previews use a non-scrolling Sheet body and fill its available space;
inline documents keep their existing fixed preview footprint. `HtmlPreviewControls`
owns the same interaction choice on native and web, outside the document viewport.
Its full-reader control region can scroll independently when text/feedback grows.
The WebView/iframe owns document scrolling; Sheet does not add another scroller.
Source/theme/interaction replacement starts a fresh native preview session, and
Retry starts a new WebView attempt. Retired native load/error/termination events
cannot change the current attempt. Source replacement preserves the user's
interaction-disabled choice. Web uses the matching sandbox/script policy and
localized preview identity; disabling interaction removes script permission.
Mermaid in a full preview does not add another Expand layer. Its zoom toolbar
reserves normal-flow space while only the diagram canvas scrolls, including at
maximum zoom. Completion and size limits, strict Mermaid security, trusted local
runtime and HTML resource/navigation restrictions remain unchanged. Native WebView
loading/termination, interaction policy, gestures and device rotation require
separate device acceptance; web renders do not prove those native behaviors.

Messages above the Markdown rendering budget disclose the preview limit and
provide a paginated plain-source reader and full-message copy. MessageText remains the rich
response owner because upstream Response does not cover scoped file citations or
the existing reader preferences. Sources needs a real source collection;
ImageGeneration needs generation lifecycle data. Soundwave needs an actual
recorder/meter. These are not inferred from ordinary links, images or busy state.
Panelside would replace navigation ownership and ThinkingOrb adds continuous
graphics work; neither is part of this transcript integration.

DocumentContent and ScopedFilePreview bind reader-local display and nested-file
navigation to their file/Host/project identity. Replacing that identity retires the
old reader chain; a text refresh of the current file preserves its selected
source/preview mode. A Markdown filename and its MIME presentation use the same
preview predicate, including generic MIME files already recognized by extension.

Scoped folder previews give their full Sheet body to one FlatList (`scroll=false`
on Sheet), with the existing loading/error/retry header and empty state in the
list. Keep entry keys, validated path resolution, visibleMediaData filtering and
the mounted parent list intact while a nested file is open; do not wrap this
collection in another vertical scroller or eagerly map the complete directory.
MIME parameters and case do not prevent HTML presentation. Extensionless raw text
uses a plain text language label instead of exposing an entire path as a language.
Raw document source uses MessageCode's bounded inline preview and full paginated
reader, with exact original copy and the displayed filename as reader identity.
DocumentContent owns its single preview action (`allowPreview=false` in the source
facade), so HTML does not show competing inline and expanded-preview actions.
The source facade accepts contextual `readerTitle` and `copyLabel` without
changing its conversation defaults. Source/preview and file sharing controls
precede content; sharing failure and local reading failure remain separate.
A failed local read without parent Reload offers a current-owner Retry and never
shows an unsupported-file instruction. Retry uses the existing query, leaves an
independent share failure visible and rejects callbacks from a retired file.
Existing parent Reload/evicted-cache recovery, sharing authority, rich Markdown
file-link context, media query keys, raw bytes and Host operations are preserved.
DocumentContent remains an embeddable consumer: it does not claim a surrounding
Sheet footer from a file editor, attachment list or other screen owner.

The tool inspector lazily projects every recorded diff line (including number
and add/delete/context marker) and the original output into a complete display
source. It paginates that projection with the shared Unicode-safe source budget,
retaining diff colors for partial lines and leaving raw output uncolored. Copy
uses the complete prepared display source, not the selected page and not an
executable patch. No locally retained lines after 300 are silently dropped.
The Sheet title owns identity; status/counts and Copy/source/path/file controls
use the shared action area outside the source scroller. The content-only caveat
belongs above source in that scroller rather than consuming fixed action space.
Empty records do not offer active empty-source copy or meaningless page controls.
Changing root path/Host scope closes the old inspector/file chain. Same-target
status/content updates preserve an open inspector and its current page (clamped
when needed); an already opened file retains its captured line and context.
Source and path copy share one native-write flight, keep their own feedback and
use the existing private/foreground guards. Open file remains a read-only action
through ScopedFilePreview and the original transport/resource owners. Rendering
proposed/rejected diff colors never grants write/apply authority. Native paging,
selection, nested dismissal and clipboard acceptance require device proof.

Agent questions (`QuestionCard`) render on PanelUI Questionnaire with the frame and
swipe off and answers controlled. Notes and free text stay bycoda Field and
Disclosure inside each item. The reply payload is unchanged, and dismiss stays a
bycoda Button that sends `skipped`.

## Record and collection controls

Focused facades also cover expandable records (`record-card.tsx`: a pressable
identity row with one chevron and a flat `details` body; never nest a Disclosure or
another expandable inside `details`), connected plan steps (`plan-steps.tsx`), draft-and-apply
collection filters (`filter-sheet.tsx`), host-local wall-time selection
(`time-field.tsx`, with searchable hour/minute choices inside the product Sheet),
and a field with its adjacent action (`action-field.tsx`). Record bodies mount
on first expansion and remain mounted on collapse. Critical feedback and
frequent actions stay outside the collapsed body. These components reuse the
existing theme, overlay, access and state owners. The lazy Data gallery includes
interactive examples without host access.

Record identity and its separate command group wrap when they cannot share a
readable row. The trigger and its title group retain a bounded intrinsic minimum
with a font-scale-aware basis; the disclosure indicator may wrap to the trailing
edge instead of splitting a word beside it. Keep commands outside the trigger,
touch targets at 48dp, and the existing visited/expanded body owner intact.

`HoursOverview` (week-hours.tsx, with week-hours-model.ts) is a read-only PanelUI
WeekHoursGrid showing when schedules fire and when quiet hours apply. Its bars are
shorter than 48dp, so every value stays editable through the form fields beside it.
Hours are host wall-clock.

## Light, dark and system appearance

`tokens.ts` owns the light/dark native palettes, semantic states, typography,
spacing, shape and motion. `scripts/build-ui-theme.mjs` generates `src/global.css`
from those tokens, imports the upstream PanelUI theme, and overrides its semantic
roles in both modes. `pnpm theme:build` regenerates CSS; `pnpm theme:check` verifies
it. Do not edit the generated CSS.

`MobileThemeController` applies the persisted system/light/dark preference before
the private workspace is available, including on the initial lock screen.
`useMobileTheme()` returns per-mode `{ mode, colors, semanticColors, uiStyles, pressedFill }`
objects whose identity changes with the mode. Components must destructure what they
read from it inside the component; the module-level `colors`, `semanticColors` and
`uiStyles` accessors are for style factories and later-running handlers only, because
React Compiler would otherwise keep stale memoized JSX. Read any other themed sheet
with `useThemedStyles(sheet)`. `theme-hook-usage.test.ts` enforces this. Use
`createThemedStyles(() => ({ ... }))` for reusable native style sets: it caches
styles per mode and resolves the current palette when read. Do not capture color
values in module-level objects or `StyleSheet.create`. A theme change updates
existing screens without remounting them or clearing drafts and form state.
Settings appearance uses PanelUI ThemeSelector controlled by bycoda's persisted
themeMode with `applyTheme={false}`; `MobileThemeController` stays the only mode owner.

The dark theme uses neutral graphite; the light theme uses a white canvas and neutral control fills.
Both share the same blue action role and semantic status roles. Controls retain
48dp touch targets, dynamic text and the system reduced-motion preference.
Action labels use the compact control type token and control radius, not pill
shapes. Secondary actions are unfilled; reserve filled emphasis for the primary
action or an explicit selected state. Do not shrink touch targets for density.
`Screen.footer` reserves space for a reachable page action outside the page
scroller, with shared safe-area padding and content width. It is not an input
composer or a second scrolling body. Terminal command entry uses the existing
Sheet body/footer owners; closing that editor retains its per-terminal draft.
Keep output in the page scroller instead of nesting a fixed-height output reader.

`Screen` and `ScreenList` show pull-to-refresh feedback only for a user pull,
not polling. Custom `refresh` callbacks must return the complete refresh promise.
An action owns its pending indicator; do not repeat it in adjacent mutation copy
or animate unrelated actions that happen to share a mutation object.
`Notice`/`ErrorNotice` are a semantic-tinted banner (hairline semantic border,
radius control, 16px tone icon, 14/20 message) with a compact quiet recovery
action on the same wrapping row. A region with no data uses `StateView`
instead (see design-system.md "States"). Recovery buttons still own 48dp targets. Text and extra required content
remain visible and can grow. Use `action` for connection repair and other
non-retry recovery; preserve `onRetry` for query retries.
Contrast tests cover text, metadata, actions and feedback in both palettes.

## Providers and private overlays

The application already owns one gesture root, keyboard provider, safe-area
provider, query cache and private overlay registry. `BycodaUIProvider` composes
PanelUI's exported PortalProvider, PortalHost and ToastViewport with those
existing owners, avoiding duplicate native managers. Its portal host disappears
immediately on lock while the mounted workspace preserves drafts.

Management collection headers put their interactive project selector in
`ScreenList.context` or `Screen.context`. ScreenHeading keeps that context next to direct actions
when the navigator owns the title; ordinary custom headings retain their title
above the context inside the identity column. Do not add a second project row
to the list header. Scope validation, project search, current selection and
directory recovery remain owned by Scope. At large text, controls and context
may grow or wrap; never shrink labels to preserve a one-line toolbar. Search and
applied-filter summaries stay in the list header and keep their state owners.
`ContextControls` column basis grows with system font scale so narrow large-text
layouts become one column; normal phone text uses two columns. Selected values may
grow vertically and retain full accessible labels. Inbox scope stays in its list heading so it can
scroll away; the outer mode selector must not acquire another fixed scope row.

Settings presents phone preferences before computer-scoped destinations. The
computer row uses the readable computer name; connection endpoints remain in
the computer list/detail owners. One Appearance row opens a full-screen shared
Sheet for theme, palette, general typography, message size and the shared preview.
`SliderField` adapts PanelUI Slider for general size and line spacing, keeping a
local drag value and persisting once on commit. Font family uses `SelectField`;
weight and the three named message sizes use `SegmentedControl`. Message sizes
retain `chatTextSizeOptions` and compact/standard/large persistence. Appearance
read retries re-read storage; save retries preserve the current editable choices.
General typography shares normalization in `typography-preferences.ts`, runtime
application in `typography-runtime.ts` and subscription-aware themed style caches.
The subscribed snapshot must remain an input to style resolution so React Compiler
observes size/font changes as well as palette changes without remounting readers.
Its section heading owns the visible text-size label while the selector keeps
the same accessible name, including when large text uses its selection sheet.

Development server and runtime-log rows reserve their identity column for the
name/message. Status/severity belongs in wrapping supporting content rather than
a wide trailing badge. Server ports have their own readable metadata line; full
commands/endpoints remain inspectable in server detail. Explicit row labels retain
status, time/source or command/ports for screen readers. Log list/detail severity
labels use the same mapping as the filter. Log monitor setup is a named action in
the shared overflow menu; refresh stays direct and filter edits stay staged until
Apply. Moving that entry must not remount its existing monitor editor or search.

Device discovery has one availability presentation owner. When discovery reports
partial errors, combine its unique reasons and unavailable-platform context in
IssueSummary; identical list/status reasons retain a platform-qualified identity.
Without discovery errors, platform limits stay in quiet Details disclosure.
Keep collection retry scoped to the failed list. Toolbar and pull refresh share
one flight for status/list reads. Device service setup belongs in the common
overflow menu, with runtime/viewer owners outside the virtualized header. Device
readiness wraps below the identity and remains in its full accessible name.

Reviewed connection epochs are owned by `src/state/connection-scope.ts`. Device list windows, runtime,
viewer and preview capture an opening lease and recheck both that lease and the
reviewed machine before acting or publishing asynchronous results. Batched
endpoint/credential/environment/active-computer A/B/A changes retire old leases.
Name-only updates retain window/input state. Device window portals also inherit
the list owner's connection lease, concealing retired content while allowing
normal close animation. A newly opened window requires a fresh review; this
does not alter preview-intent storage keys, receipts or unknown-result recovery.

Use the application Sheet facade for product forms, selection, confirmation and
session details. It owns dirty-form guards, back handling, focus restoration and
security visibility. A library component never grants permission to send,
approve, upload or publish. Native map rendering requires the optional MapLibre
integration and a compatible development build. PanelUI Support/Feedback need an
explicit service setup; installing the library does not configure them.

Sheet measures the frame remaining after its keyboard owner applies padding and
the rendered header height. Ordinary `size="form"` sheets fit their content up
to 90% of the window instead of stretching short forms across that whole area.
The shared action area uses the Sheet panel surface. Filled inputs and quiet
buttons keep their existing fill surface, so a footer editor such as New branch
remains identifiable when empty and unfocused. Do not recolor the field or add
screen-specific footer surfaces to compensate for a fill-on-fill action area.

Long content still scrolls above the separate action area. With `scroll={false}`,
form sheets retain a definite viewport for caller-owned lists and readers;
`size="full"` still fills the available frame. Resizing never replaces the editor
or moves its state into the Sheet. The title has its own scroll viewport capped by the
available frame (at most two touch-target rows); full title text and its accessible
label remain intact. Close/custom header actions stay aligned to the top instead
of following a tall title's center. This bounds long identities without shrinking
or ellipsizing them. It reserves an input-sized body viewport and bounds
the separate action scroller to the remaining space. When scaled labels or errors
make actions taller, that scroller owns feedback and controls together; feedback
does not add a nested vertical scroller inside the action area. Editor state and
callbacks remain in their original owners.
Native Sheet heading/trigger focus is owned by `useNativeSheetFocus`. It requests
accessibility focus only after the native screen-reader query confirms enabled,
and rechecks private-content access and the application lock before each queued
request. Closing before the query resolves performs no focus transfer. Reopening
the same Sheet cancels its older queued return request. Web focus remains owned
by the overlay focus controller. Native TalkBack traversal and modal containment
still require device acceptance; automation tree visibility alone does not prove
screen-reader reachability.
`FormActionRow` is the shared presentation owner. Registered Sheet operations
come before their operation feedback in that bounded action scroller, so an
arbitrarily long failure cannot displace the initiating controls on opening.
Feedback remains fully scrollable and its recovery controls keep their existing
callbacks. Standalone FormActions retains its inline feedback order and bounded
feedback viewport. Empty rendered fragments add no gap; spacing follows the
measured feedback content and disappears when it becomes empty. Keep the action
row in its stable child slot when feedback, pending state or labels change.

Screen's explicit footer is a separate bounded action scroller. The measured
positive scene and, for non-scrolling screens, the measured fixed header feed
`screenFooterLimits`; the remaining form retains an input-sized reading budget.
Transient zero/invalid layout events retain the last positive measurement. The
body keeps its existing KeyboardAwareScrollView and callbacks through footer
appearance, resizing and feedback changes. A stable outer KeyboardAvoidingView
owns IME geometry only while the footer exists; the body's keyboard adjustment
is disabled then, so both regions fit above the keyboard without double insets.
Without a footer, the body retains its keyboard-aware behavior. Measure the
inner scene after this allocation, never the full window. Footer content owns
its horizontal safe-area padding and removes the bottom navigation inset while
the IME owns that edge. Changing footer availability must retain the field,
draft, focus and selection.
`FormActionScrollOwner` is a presentation-only signal: FormActions in this region
places controls first and leaves feedback scrolling to the surrounding owner.
It does not register actions, execute callbacks, copy values or change guards.
Standalone FormActions keeps its original inline feedback region. Do not nest a
second operation-feedback scroller in Screen's bounded action area.

Access and provider review sheets keep consequences in the scrolling body and
use `FormActions` for the initiating action, confirmation and local recovery.
Technical connection/device identifiers belong in Details. Toolbar and pull
refresh share one `usePullRefresh` controller; failed reads take precedence over
empty success messages.

A reviewed operation captures the computer ID, endpoint, environment and
transport identity. A changed connection retires its editor and approval, even
when the saved ID is reused or the previous connection returns. Self-revocation
flushes drafts before sending. Confirmed revocation may remove only its reviewed
local connection: `removeMachine(id, reviewedIdentity)` checks that identity
inside the same mutation queue as pairing updates, before touching SecureStore.
Local cleanup retry never repeats the remote revocation.

Accounts/MCP keeps observed-cache explanations and timestamps in Details so the
collection remains the main content. Account review consequences precede Details
in the scrolling editor body; delivery/result recovery stays with FormActions.
The account draft key, target, session, project, account and expected revision
belong to the opening editor. Connection or target changes retire that owner;
a temporary transport loss for the same identity preserves its unsent draft.
Metadata edits and Claude quota observation have independent capability gates,
rechecked after persistence before dispatch. Result recovery reads the saved
operation and never resends it.

Computer task settings keep the machine identity captured when the panel opens.
Changing the active computer does not replace an unsent form with another
computer's settings. Retired forms remain readonly; lost authorization hides
cached values while retaining the unsent draft for permitted recovery. Reads and
write acknowledgements validate the host settings shape before presentation.
An unknown save exposes one Refresh action, preserves the draft, and labels the
readback as last received limits rather than an operation receipt. Technical
causes stay in Details. Only an explicit later Save sends settings again.

Command-shell profiles retain their exact host IDs, including Unix executable
paths. The editor freezes its profile list and expected chosen ID, requires a
matching acknowledgement, and retires observed connection changes. Unknown saves
remain guarded against resending; explicit dismissal remains available through
the shared dirty guard and refreshes the preference before another review.

Local connection removal reviews a captured list of computer names/routes. Short
reviews use the intrinsic compact Sheet body; larger reviews use one ScreenList
and keep that choice stable through partial removal. Both share RecordCard rows
and FormActions outside the body scroller. A new/replaced computer retires the
review instead of widening its scope. Missing reviewed computers are already
removed; a partial retry addresses only still-present matching identities.

Single-computer removal changes the existing management Sheet into a compact
review, with one captured name/address and a concise local-removal consequence.
Keep Remove/Cancel and operation feedback in FormActions. Capture endpoint,
environment ID and LAN key with the saved ID; recheck after retaining workspace
drafts and pass the identity into serialized store removal. Observed replacement,
missing metadata, storage failure or pending connection changes retire the review
until explicitly reopened. Returning to the original connection never revives it.
Another active computer does not prevent removing the reviewed saved origin.
Consent-gate disconnection also passes a captured identity to store removal.

Bulk removal passes each expected identity to the machine store's serialized
removal and clears only that removed computer's query cache. Disconnected local
cleanup runs through `withDisconnectedComputers` so pairing cannot interleave.
Draft cleanup additionally uses the shared `local-draft-storage` barrier: drain
existing per-key work, retire unprotected editor generations, then remove metadata
and sweep files before releasing later work. Old debounce/unmount callbacks must
reject retirement; a fresh editor binds the new generation. Only global draft
flushing may skip an explicitly retired owner. Notes mutations carry their captured
owner, and native attachment picking captures ownership before awaiting the picker.

Pending queue intents and unreadable composer records retain their storage keys
and attachment scope directories. Delete ordinary message/file/note/Git/queue-edit
drafts without touching operation receipts, SDK state or attachment claims. Sweep
only validated direct children of the app-owned draft root, never the entire root.
A failed file sweep remains retryable after metadata removal; retired writers stay
retired. Cache generations reject late media responses after cache deletion.

Routine cleanup success uses transient feedback. Retained recovery data uses a
persistent informational Notice with a Computers action; errors stay in the active
review with retry. Fixture storage/file seams prove only local source behavior,
not physical-device deletion or Host operation recovery.

DocumentContent and MediaViewer share one `useMediaSharing` owner for local-file
handoffs. Capture URI, title and MIME together, claim single flight before checking
OS availability, and revalidate the current live reader before opening the chooser.
Changing/closing the reader or an intervening lock/background/focus-loss retires
pending intent; returning to the same file/access does not replay it. Security
subscription tracks transient transitions even when React batches their renders.
An already opened OS chooser cannot be canceled by this local fence; never claim
external delivery or cancellation from its promise alone.

Sharing feedback belongs to the captured file and clears on explicit retry/new
identity. Keep pending on the initiating Share/save control. Current-owner reset
returns whether a parent reload may proceed; retained Reload callbacks cannot
clear another file's feedback or refetch its former origin. Preserve file reload
recovery after cache eviction. Image decode failure has independent error/retry
state and a fresh image attempt; late image errors cannot overwrite its retry.
URI/reopening still owns zoom reset, while gestures and actual native export stay
separate acceptance from web geometry and mock API calls.

Legal document links use the app's existing single-flight mutation owner. Claim
the operation before the first await, set its target only inside the claimed work,
and render pending/error feedback under that row. A queued or retained handler
from an unmounted/replaced document cannot open another app. Legal content remains
offline and accessible before protected navigation; the existing QueryClientProvider
already wraps SecurityGate and the public document surfaces. No Host request is
introduced. Keep the selectable support address unbounded at large text sizes.

About/rating/public-page/share actions use the same row-local feedback hierarchy.
Preserve the native share anchor, configured public-only payload, store capability
checks and synchronous single flight. Sharing cancellation is quiet information,
not proof of delivery. Late results cannot update an unmounted owner. External
handoffs and native Share require separate device acceptance; web rendering keeps
unsupported sharing/rating disabled rather than pretending those services exist.

Report content uses Screen's footer and FormActions for Send/Discard. Delivery
failure, acknowledgement and the full selectable receipt stay beside Send in the
shared bounded feedback area. Service unavailability is one informational Notice;
field validation stays with Description or consent, and a received report must
not display a missing-consent error. The memory-only draft and excerpt remain
editable under their existing send/consent rules.

Discard opens a compact Sheet with shared actions, bound to the reviewed draft,
request, receipt, status and in-memory revision. Changing content or starting a
retry retires the review, even if the visible state returns unchanged. Old review
callbacks cannot consume a later review; stale/unmounted Send callbacks cannot
retarget another report. The store compares synchronously before reviewed discard
or Send. Retry preserves the request ID for unchanged content; revision is local
UI ownership metadata, never a new transport ID or persisted transcript field.
Default lifecycle discard still invalidates late results under the existing
memory/privacy owner. Real delivery and native keyboard/privacy acceptance remain
separate from fixture proof.

PairingEntry chooses the entry mode; PairingPreview owns only the reviewed
identity and shared FormActions presentation. The connection controller retains
code parsing, claim IDs, redemption, identity checks and credential writes. Keep
the full computer name and endpoint readable; the icon/title row uses a bounded,
shrinkable text column, including unbroken names. Do not ellipsize the identity
being reviewed or let an unconstrained heading widen the page.

PairingPaste retains rejected input for correction and clears stale validation
feedback when text changes. Its mounted owner is retired synchronously on cancel
or unmount; queued/captured submit handlers must not call validation after that
point. Once validation has started, the connection controller's generation/access
guards still own cancellation. Pairing input stays ephemeral; this presentation
repair does not persist pairing tickets or weaken lock/reset behavior.

The QR scanner latches each delivered code before scheduling validation. A rejected
code unmounts the camera and retains one ErrorNotice with explicit Scan again;
there is no automatic error/rescan loop. Success stays latched until navigation.
Read-permission failures replace initial loading with retry. Permission reads may
settle after lifecycle changes, but they must not trigger a permission prompt from
an inactive, unfocused, locked or retired scanner. Leaving invalidates input before
calling navigation. Physical camera ownership also changes across blur/return,
including batched lifecycle events, so old barcode/mount-error handlers cannot
operate on a resumed camera.

Screen's optional `onContentViewport` reports the padded scrolling viewport after
fixed footer allocation; it does not subtract native header/safe area twice.
Consumers still measure their own content and headings. The scanner measures its
intro and feedback, fits a square stage into the remaining body, and keeps Paste
pairing code in Screen's footer. Essential text and the minimum usable camera size
may still require body scrolling at extreme text sizes. The footer remains outside
that scroller; do not replace measured clearance with device-height offsets.

Type checks, catalog/theme tests and web export validate source integration.
Keyboard, gestures, text scaling, reduced motion, lock transitions and both
appearances still require simulator/physical-device acceptance.


`Card` defaults to `variant="plain"`: a task group sharing its page gutter.
Nested groups do not multiply padding. Explicit `variant="surface"` retains a
semantic raised task area when needed. This is one facade, not a second kit.
`Button` and `IconButton` keep their full target during presses; opacity supplies
feedback. Long selectable option labels wrap in the shared selection owner.


ActionReviewSheet owns the shared form Sheet/FormActions preflight composition.
It does not validate or send a command. JiraBoardActionReview uses it for a readable
preflight: issue, board and the named transition/destination/anchor lead; full
project and exact request details are available through Disclosure. The editor
retains the captured command, selection and delivery authority. Cancel sends
nothing. Old review/confirm/dismiss callbacks retire on replacement, dismissal,
lock or unmount; the delivery owner still enforces machine identity, durable
pending claims and computer approval. Do not replace this with an automatic send
or treat a readable label as authorization.

ProviderPrReviewPreflight uses the same owner with scroll=false and one ScreenList.
The full summary and commit are in its list header; up to fifty full inline
comments stay in the virtualized list, with readable old/new line identities.
The existing editor/durable draft owns the frozen commit/event/body/comments.
Cancel preserves that draft, and the review retires after access, head, query,
readiness or draft changes. Confirm consumes it once and still goes through the
existing fresh-head, persistence and computer-approval delivery gates.

GitManagementReview also uses ActionReviewSheet with one ScreenList: reviewed
computer/checkout/branch/HEAD and complete operation fields lead; the remote list
stays virtualized and its URLs are sanitized for presentation. Do not truncate a
PR description or move its full content into a native alert. The editor owns the
frozen request/snapshot and original draft. Cancel preserves its field instance
and selection. Review, discard and form callbacks must reject replaced drafts.
Confirm consumes the review once, then the existing fresh-index and Host snapshot
checks still run. A distinct read-authority lifetime survives ordinary pending
state but retires through access/query/connection loss, so an in-flight preflight
cannot resume after that access is restored. It does not authorize a Host write
or replace the uncertain-result gate.
ActionReviewSheet forwards optional semantic action tone to FormActions; Git
deletion/history-rewrite reviews use danger while ordinary reviews keep primary.

GitStashes uses the same preflight for apply/pop/drop and exact-snapshot bulk
clear. List rows show stash index, a bounded message preview and supporting
date/SHA; GitStashIdentity retains the complete message and immutable identity in
selection/review. Long bulk collections stay virtualized. Apply is the direct
selection action; pop/drop are secondary menu commands, with shared footer and
danger treatment for deletion. Main heading/actions own Create and secondary
Back/Refresh/Details/Clear; full original checkout context remains visible before
every write. Do not duplicate three primary buttons or put long stash messages
into native alerts.
Creation keeps its description/mode in the existing component owner when hidden
and reopened. Only leaving that owner requires the short draft-discard guard.
Native text events may deliver multiple values before a commit: field lifetime
guards retire on close/access/unmount rather than discarding later values from
the same editor. Confirmation consumes the captured request once; list/target,
permission, snapshot-capability, pending and uncertain changes retire its lease.
Rows, context and overlays share current original-scope/read permission, and
private failure/paused/disabled windows conceal cached data while retaining the
local draft. Ordinary network cache remains readable with writes blocked until
query recovery. Host expected-SHA/snapshot validation remains authoritative.

ConflictReview and GitSelective share useGitReviewScope/useGitReviewReadAccess
for captured machine/connection/project/path and read-window lifetime. Retain
their original review and block/line choices while concealing cached source
through access/disabled/paused/private failures. A changed query snapshot marks
the retained review stale until explicit refresh; delayed refresh results cannot
erase newer choices. Local Back/discard and write-completion callbacks retire
with their owner.
useGitWriteReview binds a complete immutable request and visible output to the
current choices/readiness. GitWriteReview composes ActionReviewSheet with the
existing bounded two-axis GitDiffViewer, including its full-source pagination;
deletion is explicit and uses danger tone. Confirm consumes once and preserves
the existing expected bytes/snapshot, submitted/uncertainty latch and Host
authority. Conflict resolution keeps one direct primary action; whole-version
alternatives share its secondary menu. Choice changes must not remount the code
reader or discard its viewing position.

HistoryImportReview uses the same preflight with one virtualized selected-
conversation list, complete prompts/metadata, a readable captured target label
and inspectable project/session IDs. SessionToolbar supplies its existing human
context without adding a directory read. Main history selection uses ToggleField's
optional labelLines preview; its switch keeps the full accessible label and the
review keeps the full prompt. Default ToggleField labels remain unbounded.
History scan is explicitly opt-in: previewQuery's permanent enabled=false is
intentional and must not be treated as lost read authority. Connection/private
access, paused and private-failure windows still conceal cached review data and
retire approvals without losing selection. Batch selection excludes imported
records. Footer priority follows Scan, Import, Stop, terminal New Review or
unknown-result Check Status; a saved attempt never exposes another Import.
Confirmation captures the exact selection/digest and validates expiry before
and after its serialized durable claim. Preserve historyPendingStore keys,
useReviewedOperation single-flight behavior and the original commit/cancel/status
transport. Access lost during a claim cannot resume that accepted import; only
its unsent owned claim is cleared. Uncertain sent attempts remain recoverable.
Never query a stored attempt through another environment or restart import from
a status check. Reopening must load the existing receipt without scanning.


The PR editor projects cached review context only while its opening computer and
project, read permission and capability are current. Auth/identity failures also
conceal diff, identity, paths and editor fields; the draft owner is retained.
Use the same content gate for rows and header/forms, not only the final review.
Generic pending/completed recovery status may remain visible without exposing
payload. Retained refresh/reconcile/reset/edit callbacks recheck live access.
An ordinary authorized network failure keeps cached context, focused fields and
selection; credential-repair refresh remains available on its original scope.


Provider detail keeps captured item/origin and comment/result owners mounted.
The enclosing browse Sheet uses a safe generic title; authorized identity appears
once inside detail. Description, metadata, conversation and composer use the same
read/origin/auth/identity gate. Hiding an editor must not reset its draft. Restored
access does not reactivate captured comment confirmations, reply or link handlers.
ProviderInboxConversation accepts the shared read-only QueryLike contract rather
than requiring observer transport methods; its optional hideFeedback lets the
parent own an identical explanation and retry both reads together. Independent
errors remain separate. Connection and uncertain-result information share one
status note without erasing either fact. Frequent provider opening stays direct;
Back and consequential PR actions use the common overflow, with the shared Sheet
close retaining dismissal guards. Uncertain sends still allow local draft edits.


Comment submission uses ActionReviewSheet as the same preflight family as Jira
and PR review. The composer retains the original draft object and canonical
trimmed params, while the review presents complete text, record identity and the
actual reply recipient. Details disclose the full reply target and a marked
reference excerpt. Cancel preserves the editor DOM and selection; an edited,
retired, dismissed or replaced review cannot send. Confirmation consumes the
frozen params/draft once, preserving the existing acknowledgement and uncertain
receipt rules. Do not reconstruct the target from the label or add a native
alert after this preflight.


Provider collection rows, search/counts, connected-service payload and staged
filters share the same original-scope/read/private-failure boundary. Read-only
services can stay open for repair while their cached account details are hidden.
The selected detail/receipt owner remains mounted and receives the projected
availability, including the parent repair callback. Loss retires filters and
captured search/open/apply callbacks; it does not erase committed preferences.
A pending search pauses while a detail owns a draft, and resumes on return.

useInboxScrollMemory accepts explicit suspended state for concealment. It keeps
the reading target through hidden zero-offset/content events and waits for real
list measurements on restoration. Ordinary new-query loading is different and
does not rearm a cancelled restore. Do not infer suspension from ready=false:
that would restore an old offset after an intentional new search/filter.

Worktree creation uses ActionReviewSheet for the original computer, full source,
branch mode/name and base. The mounted hidden owner retains its draft and accepted
result; closing the form does not discard them. Visibility/read/access/snapshot
changes retire preflight authority. A submitted unknown result offers read-only
reconciliation instead of another Create. Selecting a confirmed folder remains a
separate action and rechecks visibility and access after the existing draft guard.

Session checkpoint file changes and conversation rewind use ActionReviewSheet.
The owner captures the original computer/session/worktree and preserves the exact
checkpoint or revision/authority token. File diffs remain bounded and affected
conversation suffixes remain virtualized; do not put a complete prompt in a list
header or a variable file path in a native alert. Loss of read authority or a new
snapshot retires pending reviews. Unknown writes still allow read-only refresh,
without clearing the delivery latch. GitDiffViewer reserves equal-width padded
line labels with intrinsic growth, so large text does not wrap line numbers.

Worktree removal separates new folder review from persisted receipt recovery.
The folder query is intentionally disabled after an attempt exists; this does not
disable explicit status reads for the original environment. Use the shared
ActionReviewSheet with optional disabled/busy/feedback state for desktop approval
and local tracking cleanup. Approval keeps the original durable key/schema and
checks expiry/access before and after claiming; clear only an owned, unsent claim
if that authority was lost. A status auth failure conceals the cached receipt
through retry until a fresh authorized result arrives. Clearing an error must not
reveal cached private results. Local tracking cleanup never cancels a Host request.

Subagent details keep the activity list primary. Full assignment and final report
use separate shared Sheet readers; do not duplicate full rich content in the list
header/footer. Stop uses ActionReviewSheet for the original computer/name/parent
and exact run/block/call details. The initiating owner keeps one-stop delivery,
including unknown results, and registers pending state through useSheetGuard so
the parent close and native Back follow the same rule. After delivery, Close and
local feedback replace the Stop action. Scope/access changes retire readers and
preflight callbacks while preserving the original target.

Coordination details remain a read-only projection with no native controller or
command port. Keep the task collection compact; full request/summary, task prompt,
file/dependency/provider settings and model choices use shared Sheet readers.
An opened reader retains its coherent proposal and document context while the
background list updates; reopening reads the current proposal. Dependency links
resolve exact task IDs inside that opened snapshot, leaving unresolved IDs as
readable text. Original computer/session/block/checkout and private-access loss
retire readers and stale callbacks. Long choices/files/dependencies stay in the
single virtualized list owner, with Close in the shared action area.

Queue collection presentation lives in SessionQueueSheet; SessionQueue and the
existing queue/editor owners retain dispatch, drain, pause, edit and reconciliation.
Use NavigationRow's optional labelLines only for previews with a complete reader;
its default remains unlimited. Queue row commands share one contextual menu,
while the active task owns Send next / Continue editing / Reload / Close.
Closing the queue presentation does not cancel an already dispatched operation.

useListScrollMemory owns measured virtualized position restoration. The Inbox
hook is a persistence adapter; a queue uses a local position port. Concealment
retires offset and last-row visibility observations from the previous list
instance. Hidden viewability notifications cannot prove that a new short virtual
extent is the real end of the collection. Retain the target until current
measurements/viewability establish restoration, and allow user drag to cancel it.


Queue editor presentation is owned by session-queue-editor-view; the original
useQueueEditor remains responsible for draft persistence and queue reconciliation.
Reload/discard use QueueEditReview with the complete current draft. Review cancellation
must retain the mounted input and selection. Failed draft reads expose local retry;
a recovered read requires explicit Continue editing before acquiring edit ownership.
Never save an unread draft or allow stale review/input callbacks after scope loss.


Session notes keep one list/reader sheet with shared footer actions and measured
list-position memory. NoteSummaryRow.labelLines is optional: previews may bound
titles only where a complete reader is available; other consumers stay unlimited.
The original machine/session/project and connection epoch own reads and transfers.
A denied detail remains concealed through failed retries until fresh success.
Add as context transfers a validated full snapshot through the existing composer
bridge; it does not edit a note, replace draft text or send a message.


Saved HTML artifacts alternate a collection and a full ArtifactReader. Its preview
reserves the real remaining viewport; source and metadata own their scrolling
regions. CodeSource is shared with MessageCode, retaining bounded source pages,
Unicode and complete-payload copy. HtmlPreviewInteraction is optional: a containing
reader can retain its interaction choice across source/preview remounts without
changing defaults for other consumers. Do not re-enable scripts implicitly or
weaken sandbox/navigation restrictions. Keep cached content concealed after denied
reads until fresh success, including when an open reader exposes a root list error.


Read-only session notes and saved artifacts use the same fixed SearchField above
the virtualized list, with the shared active-language search normalization. Search
loaded previews/metadata locally; preserve the original message/session filter
before search. No-match recovery clears only the query. Keep the input/list
mounted while typing and mask the query while reads are unavailable.

useFilteredListScrollMemory retains bounded local positions for normalized
filters and always retains the unfiltered position. Memory-port changes retire
old scroll callbacks. A last-record anchor follows measured content geometry
through virtual row remeasurement; do not use FlatList.scrollToEnd estimates.
Explicit native drag or web wheel intent releases restoration, and additional
records must not pull a user back to the end. Cached list and reader overlays
share their original connection check, including during closing animations.

Read-only collection Close/Back actions use quiet emphasis. Keep recovery or
Add as context as the active task primary instead of competing with Close.

Session browser sheets own their title and recovery actions. Use BrowserScreen's
embedded mode inside this owner; standalone browser routes retain their own
navigator title. Freeze the original connection/session/project and prove the
exact folder through the current directory before exposing browser controls.
Temporary concealment retains the draft owner, while connection replacement or
changed folders retire it. Recovery must never claim control or replay writes.
Retained draft owners must also reject delayed native input from an unmounted
transport body, while accepting consecutive edits from the current body.

Session file collections use the shared fixed-search pattern above one virtual
list, with source/type filters in a separate Sheet. Filter changes apply
immediately; Done returns to the list and Reset changes only filters. No-match
Clear search retains filters. Keep per-query/filter scroll memory and the same
authenticated attachment viewer. Earlier-message loading is an explicit quiet
secondary action; collection browsing must not eagerly load attachment bytes.
On a filter-memory change, require current native scroll proof before declaring
the target restored. A matching offset retained from the preceding filter can
precede its delayed native scroll event and must not suppress the new command.
Reconsider last-record anchors when content or viewport measurements settle,
including after the last visible row was reported. Explicit drag/wheel intent
invalidates that prior visible-row proof before later measurements arrive.

Session file collections retain the supplied session authority and key only the
local collection owner by original connection/computer/project/session/folder.
Keep the status Sheet outside the unavailable collection boundary. Mint the
existing Host client inside the collection's private access provider, whose read
port retires across close, concealment and transport replacement. Old readers
must not regain access after collection reopen. Keep search/filter/position state across
temporary loss, but mask private fields and retire filter panels. Authorization
denial requires a fresh completed explicit read; network failure is not repair.
Earlier-message actions are single flight and must match the current history
cursor. Preserve the existing paging/cache and authenticated file viewer owners.
Place potentially long computer names in the collection's scrolling context,
so the fixed search/filter region cannot consume the list's viewport.

Attachment previews have an explicit opening owner separate from their row. A
changed file/transport/context retires the old opening instead of opening the
new target automatically. Check the original canonical connection and current
private access before and after reads; serialize retries without cancelling an
existing read. Error controls and content reload callbacks have their own
current identity. Mint descendant Host clients inside the content's private
provider so close, denial and content replacement retire nested reads too.

usePrivateMediaData retains auth/identity denial on the actual QueryClient cache
entry across reader remounts and later network failure. Its proof comes from the
current cache state, not a possibly stale observer snapshot. Only completed
success clears denial; pending/paused success and removed cache owners do not
authorize content. Existing media keys, native loader and cache settings remain.

Read-only recovery footers may opt into allowCancelWhileBusy so Close remains
reachable during a file read. Existing form/mutation busy guards remain the
default; an explicit cancelDisabled always wins.

Scoped text, directory and project-media readers use useReaderScope for the
original reviewed target, useReaderContentAccess for descendant authority and
useReaderRetry for single-flight recovery. Explicit file sheets retain their
opening through transport replacement; inline ProjectMediaContent follows its
caller's current resource through a local readerInstanceKey. Neither changes
media cache keys or remounts the workspace. Project-media navigation belongs
inside the content provider and resets when loaded content changes.

Directory readers compose one virtualized ScreenList with fixed loaded-record
search and shared filter-position memory. Keep full paths in scrolling context.
Search-input, filtered-row and child-opening callbacks have separate lifetimes;
returning from a child preserves the query while retiring its previous events.
Use the shared search-matching owner rather than importing feature-layer helpers.
File query errors appear once beside Retry and Close in FormActions.feedback;
Close stays reachable during reads. Auth/identity denial remains concealed across
network failure and reopen until the authoritative cache completes a fresh read.

Full-screen file, attachment, source and image readers use ReaderContext for the
supplied original computer name and working/file path. It reads no global active
machine or transport settings and performs no requests. Context is part of the
scrolling content, not fixed title chrome; directory context belongs to its list
header. Fixed image/HTML viewports use bounded context with the shared horizontal
gutter and independent scrolling for long names/paths, leaving room for content.
Do not truncate these values or render transport endpoints/credentials. Private
content authority conceals both fields; caller cache-denial proof still controls
whether the reader mounts this context at all. Public readers omit absent scope.

SelectField and MultiSelectField share a fixed SearchField/selection-count region
above one virtualized option list. Query-specific scroll memory keeps the main
position when filtering. Search uses the active app locale and retains the input
while a live query would otherwise be stranded by a shrinking option collection.
Option details grow in full; duplicate labels retain separate value identities.
The trigger summary and panel count are sufficient without a second count badge.

Each selection opening owns its row, clear, Done and search callbacks. Retire
the opening on close, disablement, private-access loss or unmount; later recovery
does not reopen it. Filter/options/value changes retire old row and clear events,
while the current input accepts batched typing. Parent callbacks still own values,
drafts, settings persistence and Host approvals. Keep missing saved values and
allow removal at the selection limit; never silently normalize them away.

ProjectPicker owns a visible opening with the original canonical connection and
reviewed computer. Its fixed SearchField sits above one virtualized ScreenList;
full computer names and directory feedback belong to the scrolling list header.
Use native-title/no-bottom-inset chrome inside the shared full Sheet and keep
quiet Close reachable outside the list. Rows compose NavigationRow directly,
without the workspace command/shared module or decorative row wrappers.

Picker selection checks the current filtered object and exact project ID/folder
through the directory's visibility owner. Retire close/selection immediately;
old filtered rows, input, clear, retry and repair events must not revive after
close, recovery or connection replacement. Temporary directory loss masks and
retains the query/position. Explicit retry is single flight; its promise also
belongs to pull-to-refresh. ToolDirectory's pending picker and deferred navigation
retain their original canonical connection, including same-ID A/B/A re-pairing.
Keep navigation approval in its existing parent; selecting a project does not
authorize the deferred action to follow a different connection.

Project-directory visibility proof starts at QueryClient creation through
observeProjectPrivacy. Auth/identity denial belongs to the exact cache owner
and survives batched errors and unmounted readers. Only a completed fresh data
revision restores it; cancellation reverting to an older success does not.
Explicit privacy expiration is separate from generic query invalidation, which
also occurs on ordinary network errors. Keep valid stale rows on network failure
with the existing warning. Explicit successful metadata mutations expire only
matching proof for their original computer. Directory display and exact ID/cwd
selection use the authoritative cache payload; do not substitute lagging observer
data or broaden RPC/invalidation scope.

Operational task, goal and crew records use the same session-navigation pattern:
a labeled 48dp MessageSquare IconButton beside the record overflow. Keep session
IDs and original machine/project navigation with the feature owner. The footer
holds work controls rather than a persistent session-navigation text row. Active
Stop remains direct through each feature's existing eligibility owner; preserve
its confirmation, pending state and Host guards. Crew Pause affects new work and
must remain distinct from stopping active work. Idle paused/finished records must
not acquire a redundant Stop or empty footer during this composition change.

Task bulk controls use a full shared Sheet rather than expanding the collection
header. Selection, batch/lock, results and callbacks stay in TaskBulkActions;
presentation Close never cancels an approved serial batch. Keep its quiet Close
footer outside the body scroller. The closed initiating region retains progress,
result summary and failed-only retry; the open panel owns the same feedback
without duplicating it behind the modal. MultiSelectField owns nested selection
and its summary. A closed/replaced/unmounted opening cannot approve a deferred
non-retry operation; existing failed-only recovery remains available outside it.

Bulk skip-reason presentation belongs to management/tasks/bulk-feedback.ts.
Translate exact local eligibility explanations only for skipped results at render
time through the current copy callback. Retain raw results so changing locale
updates existing feedback without re-running work or losing selection. Unknown
reasons and all failed Host text pass through unchanged; never use substring
replacement to reinterpret a server failure as local policy.

AgentFields keeps editable/custom model IDs and model-default migration in the
form owner. Its focused AgentModelPicker owns only a catalogue opening: fixed
search, one virtualized list, full model IDs, measured query-specific position
and fixed quiet Close in the shared full Sheet. Retire row/input/close callbacks
on close/unmount or provider/disablement loss; catalogue/filter changes retire
old row choices. Catalogue errors belong inside the open chooser, not behind it.
Use the current app locale for matching. Keep web opener-focus restoration and
the existing native model-input returnFocusRef as separate platform contracts.

Disclosure.feedback stays outside both its trigger and collapsed animated body.
Use it for a validation explanation that must remain visible while optional
fields are closed. Keep one error instance rather than duplicating it inside and
outside the group. Name the affected field when several checks share a group.
The feature still owns raw values, validity and save gates; clearing feedback
must not remount a visited editor. Existing disclosures without feedback retain
their lazy body and layout behavior.

TaskBulkActions.context composes caller-owned collection metadata beside the
bulk trigger in one wrapping Row. Keep progress/results outside that row at full
width. Collection no-match recovery belongs to QueryState.emptyAction so its
existing loading/error precedence remains authoritative. Search clearing keeps
scope/status and returns focus to SearchField; status restriction clearing keeps
computer/project scope. Do not show a no-match action for truly empty data or a
failed read. Keep FilterSheet Reset-to-default distinct from clearing a filter.

Automation, steward, note and crew collections follow the same QueryState empty
recovery contract as tasks/goals. Decide whether search has no matches from the
current pre-search scope/view, never from another project's or tab's records.
Use active-locale matchesSearch rather than runtime-default lowercase matching.
Clear search through the shared empty action, retain grouping/tab/scope and
restore input focus. Keep the field X available while QueryState owns whether a
separate empty action is appropriate under loading, failure or real emptiness.

Automation history uses a full shared Sheet with one virtualized ScreenList and
quiet fixed Close; never silently slice returned runs to fit a parent card.
Move the latest summary into the open history and retain exact completion-based
error deduplication. The parent restores its summary on close. Freeze the read
resource and canonical connection epoch per opening, conceal expired history,
and guard session navigation against stale rows, closed/unmounted openings and
same-ID re-pairing. Existing query keys/parameters/polling and Host authority stay
with their owners; all returned data is not a claim about server archive limits.

Dynamic copy must retain static catalog keys with named placeholders. Format
display numbers with the active locale before substitution; constructing a
translated message with interpolated template literals bypasses catalog
extraction. Display-only localization must preserve numeric editor values,
drafts and transport payloads across a language change.

Saved computer collections use ScreenList under a non-scrolling Screen shell;
pairing forms retain their single scrolling Screen. Native navigator title and
actions remain authoritative; use the shared heading only when native chrome
does not own it. Keep short lists free of unnecessary search, retain active
search if a collection shrinks, match names/endpoints with the active locale,
and let unavailable storage feedback take precedence over no-match recovery.
Computer selection/removal and pairing stay in their existing guarded owners.

Computer entry starts when its controller owns a target, including the initial
method choices. Header Back, hardware Back and route-gesture policy must agree
on that boundary; keep ordinary empty-root route Back available. All exits use
the existing busy/dirty cancel guard. Method explanations without another reader
must grow rather than ellipsize as a list preview.

The saved-computer list retains the shared filtered scroll-memory owner while
pairing conceals its viewport. Use explicit suspension so removed-list callbacks
cannot overwrite the reading target; restore through measured list events and
release the target when the user scrolls again. Keep this ephemeral and preserve
the existing connection controller and drafts.

An unpaired computer invitation already communicates the unpaired state; do not
append the same invitation as secondary status. Keep distinct paired connection,
permission and storage recovery information and its existing menu actions.

Compact Empty content aligns with its screen/list column: no second horizontal
gutter, existing readable text sizes, growing messages and a reachable action.
Reserve the explicit expanded centered variant for a deliberate entry treatment.
Keep QueryState's loading/error precedence and caller-owned recovery callbacks;
a visual simplification must not convert failed reads into empty collections.

Notice message width follows OS text scale. Let the recovery action wrap below
the message when a large-text paragraph needs the available width; do not leave
it in a narrow column to keep Retry beside it. Keep full messages and existing
tone/action priority, callback and busy behavior. The enclosing screen/Sheet
keeps ownership of scrolling and fixed actions.

Current preference values and permission states are complete decision facts;
allow their NavigationRow details to grow with detailLines=0. Prefer a precise
task label plus the selected value over repeating the field name in the detail.
Keep preview truncation for collection details that have a deliberate full
reader; do not change every navigation row's default globally.

Chat preference recovery stays with its persistence owner: distinguish read from
save, bind Retry to the current failure and retain the current choice/queued
writes. Reading an unavailable preference must not silently save a default.
Root summaries, pending reads and editor recovery use one feedback mapping;
keep an initiating busy notice visible until its operation settles.

Local collection search uses the active application locale through matchesSearch,
including tool devices, development servers and configured agents. Omit missing
optional metadata from both matching and displayed summaries. Keep a nonempty
search draft visible when a successful refresh empties its collection; clearing
no-match recovery returns focus to the existing SearchField.

Scroll owners use scrollKeyboardDismissMode for their native dismissal policy.
On web, RN Web's on-drag handler dismisses focus on programmatic/browser scroll
too, so use none there. Native interactive/on-drag policies remain unchanged.
Do not compensate with focus timers, remounts or an additional scroll owner.

Runtime-log search remains Host-side and debounced; do not apply local matching
or locale normalization to its transport query. Search-only no-match recovery
says Clear search. When source/level restrictions are active, Clear filters
clears those restrictions and search together. Both restore the existing search
field's focus and cancel pending search drafts; preserve the auto-refresh choice.

MutationState's quiet five-second success acknowledgement belongs to an operation,
not its localized text. Translate an active message without extending its window
or replaying it after expiry. An optional mutation submittedAt distinguishes a
new submission even if an intermediate pending render is batched away; standard
Host mutations and async actions already retain that field. Use it as identity,
not as an expiry timestamp: long-running work still deserves a fresh success
window on completion. Keep pending/error priority, persistent uncertain outcomes,
caller-owned scope and existing caption placement; do not reset or retry a
mutation to update presentation.

## Identity icons

`duotone-icon.tsx` owns the typed 24-grid identity glyph map. Use its named components at identity sites of 20dp or larger, passing the existing size and theme color. Back planes share the foreground tint at 35% opacity. Utility controls, dense metadata, inline feedback and all glyphs below 20dp stay Lucide. `ProjectIcon` owns folder/group fallbacks; `StateView` owns full-region tone glyphs. `IconTile` and `NavigationIcon` remain child containers. Custom project symbols/logos and provider brands retain their owners. Dock artwork belongs to `dock-icon.tsx`.
