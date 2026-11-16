# PanelUI component adoption contract

The installed package is `panelui-native`, not `portalui`. The source inventory
is `src/ui/catalog.ts`; package availability is checked by its adjacent test.
Use the pinned package and existing bycoda theme/providers. This document lists
selection candidates and integration boundaries, not completed migrations or
unverified upstream prop signatures.

## Selection procedure

1. Describe what the user needs to do and what currently makes it difficult.
2. Inspect the existing product facade and installed component implementation.
3. Compare appropriate patterns by clarity, number of steps, content growth,
   touch/keyboard use and fit with current screen hierarchy.
4. Reuse or extend a facade; expose only the capabilities needed by the product.
5. Verify behavior and rendered layout with real states, not only gallery demos.

Record the chosen pattern, alternatives, facade owner, preserved behavior and
acceptance scenarios in the local implementation plan. Do not equate catalog
presence with missing adoption: several candidates already back current facades.

## Task-to-component map

Names in the candidate column are actual local catalog IDs. Exact exports/props
must be checked against installed source before implementation.

| Product need | PanelUI candidates | bycoda owner / integration rule |
| --- | --- | --- |
| Clear peer navigation | `tabs` | Existing `SegmentedControl`, navigator and floating-tab owners; preserve route semantics, avoid duplicate tabs |
| Secondary actions | `menu`, `context-menu` | `src/ui/overflow-menu.tsx`; retain accessible trigger and visible frequent actions |
| One/many values and search | `select`, `search-bar`, `tag-input` | `src/ui/select-field.tsx`; `src/ui/search-field.tsx` is built on `search-bar`. Preserve single/multiple/free-entry contracts |
| Fields and numeric values | `input`, `input-group`, `otp-input`, `number-input` | `src/ui/fields.tsx`; `src/ui/number-field.tsx` on `input-group` commits every keystroke (`number-input` commits on blur); `src/ui/code-field.tsx` on `otp-input` for verification codes only. Retain labels, refs, keyboard, validation and pending state |
| Advanced details/history | `accordion`, `timeline` | Existing `Disclosure` or focused shared composite; do not collapse required errors/state |
| Long editors and confirmation | `bottom-sheet`, `dialog` | `src/ui/dialogs.tsx`; preserve private overlay, dirty guard, Back, focus and keyboard owners |
| Loading, empty and feedback | `skeleton`, `empty-state`, `alert` | `src/ui/query-state.tsx`, `src/ui/feedback.tsx`; `StateView` renders on `empty-state` for empty/waiting/unavailable regions, and `Skeleton` hands off through `useSkeletonHandoff`; `Notice` only for action feedback; no connection or stale banners |
| Message composer and transcript | `ai-input`, `message` | `src/ui/chat.tsx` plus workspace owners; preserve virtualized list, streaming, drafts, queue and measured composer. `message-scroller` was evaluated and not adopted (LegendList stays) |
| Agent work in the transcript | `task`, `reasoning`, `shimmer`, `thinking-orb` | `ChatActivity`/`ChatStreaming` in `src/ui/chat-activity.tsx`: a status glyph (an orb naming the kind of busy while running) and the work summary, opening onto `Task` step lines with file chips; each step opens the feature-owned inspector |
| Attachments and code | `attachment`, `code-block` | Chat/file preview facades; keep transfer ownership, cancel/error and readable wide-content handling. `CodeSource` (`src/ui/code-source.tsx`) draws all source with `code-block`, sized by the chat text-size preference through the vendored `textStyle` patch; paginated plain pages keep wrapping |
| Web links in a reply | `sources` | `src/ui/message-sources.tsx`: a markdown list of two or more web-only links renders as `Sources` (open, foldable); single link rows use `Sources.Source`. The message owner opens links so failures reach its error line |
| Rows, cards, chips and press feedback | `animated-pressable`, `chip`, `separator`, `badge`, `collapsible`, `page-header`, `input-group` | `PressableCard`, `NavigationRow`, `SelectField` rows, `TimeFieldTrigger` and floating tab items press through PanelUI `AnimatedPressable`; `ChoiceChip` is `Chip`; `Disclosure` is `Collapsible`; `ScreenHeading`/`LargeTitle` use `PageHeader` parts; status dots and counts use `Badge`. `item` was evaluated and not adopted for these rows: it fixes `accessibilityRole="button"` and overwrites `accessibilityState`, losing radio/selected/expanded semantics. `avatar` was not adopted for `AgentAvatar`/`IconTile`: it is circle-only with fixed sizes and a text fallback |
| Execution plan | `plan` | Existing structured transcript/plan presentation; real progress and expandable details. `planner` and `timeline` were evaluated and not adopted |
| Dense structured data | `table` | Use `src/ui/metric-row.tsx` for fixed read-only label/reading summaries; use focused table presentation for richer collections. Preserve all fields/actions and readable narrow-screen details |
| Pairing | `qr-code` | Existing connection flow; no QR credential/expiry/security contract changes |
| Contextual help | `tooltip`, `accordion` | Shared disclosure/help; touch and screen-reader access, never hover-only explanation |
| Appearance | `segmented-control`, `slider`, selection | `AppearanceSettings` in the full-screen Settings sheet composes theme/palette, `TypographySettings`, chat size and the shared preview. `SliderField` commits once per gesture. `MobileThemeController` owns mode and general typography application. |
| Agent questions | `questionnaire` | `features/workspace/question-card.tsx`; reply payload unchanged |
| Long documents | `section-progress` | `src/ui/section-progress.tsx` (`SectionNavigator`) for terms and privacy; a sibling of the scroller |
| Schedules and quiet hours | `week-hours-grid` | `src/ui/week-hours.tsx`, read-only beside the editable fields |
| Hold-to-confirm | `progress-button` | `ProgressButton` in `src/ui/buttons.tsx` for one deliberate, hard-to-undo action; not for routine submits |

## Integration boundaries

Project workspaces use `src/ui/workspace-frame.tsx` for measured header/body
allocation. Growing context or feedback scrolls in the header's region while the
selected list/editor retains a usable viewport and its mounted state owner.
Keep active navigation first and overlays outside that scroller. Native inset,
keyboard and navigator geometry remain with their current owners.

For multiple structured query/mutation failures, reuse `IssueSummary.details`.
Retain each source's real QueryState/MutationState node and precise recovery;
never replace an auth repair or uncertain write with an inferred generic Retry.
Move a working-folder query's feedback into its active picker and restore the
header owner on close, so a modal cannot conceal its own required recovery.


Use `NavigationRow.supporting` for status and contextual content that must wrap
below the title. Reserve `trailing` for compact accessories; a running badge or
long timestamp must not consume the title's readable width. Disclosure rows keep
counts/status with the identity column. Preserve the full accessibility label
and the initiating row's action and state.

Hierarchical session rows use `src/ui/hierarchy-frame.tsx` to measure their cell
and reserve readable identity space before indentation. The same result governs
folder and session rows in both list families. When indentation is compressed,
retain visible immediate-parent context and the full accessible ancestry; do not
flatten the data graph or change search/collapse semantics to fit a narrow region.

Shared `Row`, ScreenHeading actions and SearchToolbar actions own nested width
constraints. Do not fix an escaping action by clipping it, shrinking its label,
or setting a device-specific offset. Preserve readable labels and at least 48dp
targets while groups wrap within the available width.


`SegmentedControl` keeps up to three direct choices when the measured region
has a readable width budget. Larger sets, large system text and labels taller
than a touch target use the existing labeled `SelectField`. The value and
change callback stay controlled by the consumer. Do not shrink labels, wrap the
upstream moving indicator into several rows or add per-screen font thresholds.

`MetricRow` keeps its label and full selectable reading, allowing either to wrap
at large text sizes. Consumers own units and missing-value semantics; an unknown
reading is not zero. Do not truncate or shrink essential readings to hold two
columns on one line.

Embedded readers may pass `onManageConnections` to `QueryState` and
`ProjectDirectoryFeedback` so their existing close/dirty policy runs before
connection-repair navigation. By default `QueryState` asks the nearest Sheet to
close its stack, approving each ancestor's independent draft before `/machines`
navigation. A pending ancestor refuses the transition without retaining it for
automatic resumption. Outside a Sheet it preserves ordinary route navigation.
Route editors with `usePreventRemove` explicitly retain their route action so
their draft/recovery policy runs before they unmount.
Custom editor flows can use `useSheetGuard().requestCloseThen` for recovery.
The Sheet owns discard approval; cancel never retains the continuation for a
later close. Pending, hidden and unmounted owners reject approval, and the
continuation runs only after the approved close callback. Keep navigation in
this continuation; it does not authorize a host mutation or a draft save.
`Sheet.onClose` is the final approved callback, not another dismissal guard.
Put dirty/pending policy on that Sheet or register it from its body. Footer
Cancel uses a guard captured inside the same Sheet; descendant `FormActions`
still register with its shared action area. Non-form selections may supply
`discardTitle`/`discardMessage` to clarify that closing changes no files.
Project selectors should use `ProjectDirectoryFeedback` for query, privacy-sync
and reconnect state instead of stacking separate notices for the same directory.

Stateful viewers/setup Sheets belong beside a virtualized list, not inside its
header. Capture the computer/project and reviewed connection identity when they
open; a scope or pairing change closes that reader and rejects late callbacks
from its old instance. Appearance changes must not reset it. Keep reviewed key
material in memory only, never in rendered labels, React keys or persistence.

A monitor editor may retain an unsent address after a connection/project change,
but its opening target and confirmation must remain fixed. Invalidate that
instance until it is reopened, including if the original scope is restored.
Keep the target visible and explain independent browser/process consequences
at confirmation. Opening or refreshing an editor never starts a monitor.

When a list toolbar and pull gesture refresh multiple queries, pass the same
`usePullRefresh` controller through `ScreenList.refreshState` or
`Screen.refreshState`. Both entry points
share its busy indicator and flight guard; background polling stays quiet.
Availability failures own contextual recovery and must not be presented as a
successful empty collection. Staged filter feedback belongs to the open filter
Sheet while it is active.

Usage pagination belongs to the current project and reviewed computer
connection. Reset its cursor before a new scope is read; a same-id pairing
replacement also starts at the first page. Keep the chosen time range and UTC
window explicit. A successful empty later page owns one first-page recovery
action; an error keeps its retry instead of claiming an empty success. Refresh
from the toolbar or pull gesture resets to the latest first-page window, while
background reads never impersonate a user refresh.

The shared browser separates unsent URL/text/comment drafts from its transport
session. Reconnecting the same reviewed target may replace that session without
discarding drafts; a different computer, pairing, project, conversation or start
URL owns new drafts. Keep these identity keys opaque. Never retain the old
lease, frame, review approval or selected-page snapshot as authority for the new
session. Release late claims before the replacement session reads, and validate
the reviewed connection again before dispatch. Browser details retain the full
current URL and shared-browser explanation; preview content precedes its control
actions so repeated chrome does not consume its viewport.
Setup/close review replaces its initiating action in that same region; keep a
close review beside the preview controls instead of moving it to the page top.

Line-based terminals use one page scroller for output, not a fixed-height output
scroller nested inside it. `Screen.footer` reserves real layout space for the
command action outside that scroller and owns its bottom/side safe-area padding.
Editors open in the existing Sheet body/action owners; closing a command editor
keeps its per-terminal draft. Switching terminals does not send or discard it.
If a terminal disappears, retain its draft in a read-only recovery view rather
than targeting a different terminal. A reviewed connection/project change owns
new terminal state and rejects old callbacks. Stop/close review names the exact
terminal; uncertain operations keep drafts and require explicit reconciliation.

Server start/detail overlays are siblings of their virtualized list. Keep form
fields and detail state mounted when the header leaves view. A reviewed target
owns each server operation; late responses must not reset a different target's
draft or open a foreign-project detail. Detail/impact/log read failures have
priority over successful-unavailable explanations. Manual reconciliation shares
one flight with mutations, and only a successful current-scope read clears an
uncertain result. During impact review, replace the initiating actions and keep
the process list/consequence in the body, with concise footer actions. Embedded
private preview reuses BrowserScreen with one outer title and shared inset
ownership; read-only preview does not require process-mutation capability.

Product screens import `@/ui/primitives`, `@/ui/chat` or focused product modules.
Shared implementations use narrow upstream subpaths. Keep colors/metrics in
`tokens.ts`, variants in `design-system.ts`, and reactive native styles in the
themed style layer. Preserve the single gesture, keyboard, portal and query owners.

Do not replace security-aware Sheet routing with an upstream portal simply
because the library offers a sheet. Inspect presentation reuse separately from
modal lifecycle ownership. Prototype candidate presentation in the lazy gallery,
then verify at least one real consumer before migrating the whole family.

No new dependency, native integration, service setup, permission or activation is
implied by this plan. Optional components needing those remain deferred. Avoid
unrequested package upgrades and do not edit `node_modules` as the deliverable.

## Retained compatibility

Current Expo routes use feature owners and focused product facades. The former `src/screens/` and `src/ui/gluestack/` compatibility trees were removed.
The retained `src/ui/components.tsx` has no runtime-module import path from the
current app route roots. This is static application reachability, not a claim
about external consumers. Keep that compatibility contract; do not wire it back into routes
without reviewing their behavior and authority against current feature owners.

Compatibility presentation remains a thin adapter: let shared ErrorNotice own
the localized Retry fallback and shared Loading own its named loading fallback.
Preserve callback forwarding, centered presentation and progress semantics;
do not hardcode bilingual or fixed-language overrides in the adapter.

Recheck route imports when adding a screen or changing these adapters. An
unreferenced compatibility file is not a missing live route, and mapping a new
route is not evidence that its product or device acceptance passed.

## Migration record and completion

For each family, keep a local record of: existing presentation, user difficulty,
selected catalog candidate, existing/new facade, behavior invariants, changed
consumers and actual checks. Mark implemented, candidate, deferred and blocked
explicitly. Do not expose a planned prop as if it were already available.

A component change is complete only when its consumers are coherent in both
themes, narrow widths, large text and relevant async states. It must satisfy the
[UX quality contract](ux-quality.md), retain existing actions/data and have no
unintended collision or clipping. Quantity of adopted components is not a metric
of usability.
