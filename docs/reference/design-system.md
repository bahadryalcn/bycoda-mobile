# bycoda mobile design system

This is the maintained design contract for the Expo companion in `mobile/`.
Use it with [coding standards](coding-standards.md) and the
[UI implementation guide](../../src/ui/README.md). The
[desktop design system](../../../docs/reference/ui-design-system.md) owns the
desktop workbench; its Arc adapters are not mobile components.

## Product direction

The goal is an immediately understandable, easy-to-use, simple, modern and
visually refined application. Users should recognize their context and next
action without a tutorial. Reliable layout and clear interactions take priority
over decorative effects. Existing screens are migration input, not the target
quality bar. See the [UX quality contract](ux-quality.md) and
[PanelUI adoption contract](component-adoption.md) for acceptance and selection.

Put the conversation, current work and next useful action ahead of decoration.
Use neutral surfaces, clear type, consistent alignment and restrained blue
actions. Status colors communicate actual state rather than decorating cards.
Keep one primary action per active task and disclose secondary options.

Desktop and mobile share compact chrome, progressive disclosure, preserved
drafts and explicit operation state. Adapt density to touch: mobile controls
keep 48dp hit areas even when the visible control is compact (32 icon buttons, 28 chips, 40
buttons, grown with `hitSlop` or padding). Slop areas must not overlap: icon actions placed side by side
(reorder/remove, browser back/forward) use `reserveTouchTarget`, never `density="compact"`. Editable inputs and search fields reserve
48dp in layout so their native focus target does not depend on overlapping hit areas. Do not copy desktop
pixel sizes, CSS, Arc runtime or overlay infrastructure.

Avoid nested decorative cards, repeated introductions, permanent help paragraphs
and competing primary buttons. Keep labels, validation, approval requirements,
connection state and recovery visible. Optional help sentences use the shared
info icon (`Field info`, `HintLabel`, `useInfoHint`); `Disclosure` is reserved for
long, rarely needed content (see the Disclosure rule below).
Collection toolbars group secondary help with commands in `ActionMenu` and open
the shared compact `Sheet`, keeping a separate help row out of the record viewport.

## One coherent product language

This document is the canonical mobile design direction for every feature and
every contributor. `AGENTS.md` defines the workflow, `CLAUDE.md` points to those
same instructions, the UX contract defines acceptance, and the adoption map
helps select components. They must not establish competing visual directions.

The same user intent uses the same interaction, terminology, hierarchy and state
presentation across screens. Different data does not justify a different button
language, editor structure or navigation model. Consistency means predictable
behavior as well as matching appearance.

| Shared pattern | Consistent structure |
| --- | --- |
| Collection | Page identity/context → search/filter when needed → readable rows → detail/editor |
| Detail | Identity/status → essential information → primary action → secondary details/history |
| Editor | Named fields → inline validation → common save/cancel presentation → dirty/pending guards |
| Settings | Related navigation groups → labeled current values → consistent selection/editor |
| Conversation | Stable transcript → structured activity/attachments → reachable composer → clear delivery state |
| Feedback | Same meanings and wording for loading, empty, error, retry, pending and completion |

Keep one semantic palette, typography scale, spacing rhythm, icon language,
control family, overlay lifecycle and accessibility model. Use the existing
tokens and adapters as owners; refine a shared owner when needed and migrate its
affected consumers together. Repeated user actions use the same localized names,
icon meanings, action ordering and confirmation rules throughout the product.

Owner-decided terminology: an agent's unit of work is a **session** (TR
"oturum") everywhere: lists, headers, empty states, menus, confirmations,
errors, the project organization editor and history import. **Conversation**
(TR "konuşma") is reserved for the voice/chat assistant. Never call a session a
chat (TR "sohbet"); route names such as `chats` may stay.

A different pattern needs a concrete task, platform or accessibility reason.
Document that reason and extend the shared layer if the requirement recurs.
Personal taste and the appearance of an isolated library demo are insufficient.
PanelUI components must be adapted to this product language before adoption.

Before migrating a family, validate its shared pattern in representative simple
and complex consumers. Review new screens beside existing consumers, in both
themes and narrow layouts. Resolve conflicting guidance in the owning document
and update dependent references instead of adding another local rule set.

## Ownership and sources of truth

Paths in this table are relative to `mobile/`.

| Concern | Owner |
| --- | --- |
| Colors, semantic states, spacing, type, shape, metrics | `src/ui/tokens.ts` |
| Native theme subscription and style caching | `src/ui/theme.ts`, `src/ui/themed-styles.ts` |
| Generated UniWind/Tailwind theme | `scripts/build-ui-theme.mjs` → `src/global.css` |
| Control variants and semantic utility classes | `src/ui/design-system.ts` |
| Product components and props | `src/ui/primitives.tsx`, `src/ui/component-props.ts`, focused UI modules |
| Insets, titles, grouping and lists | `src/ui/layout.tsx`, `src/ui/navigation-row.tsx`, `src/ui/screen-list.tsx` |
| Sheets, dirty guards and private overlays | `src/ui/dialogs.tsx`, `src/ui/sheet-guard.ts`, `src/ui/overlays.tsx` |
| Motion and reduced motion | `src/ui/motion.ts`, `src/ui/use-reduced-motion.ts` |
| Providers and lifecycle | `src/app-providers.tsx`, `src/app-lifecycle.tsx` |
| Upstream inventory and compatibility | `src/ui/catalog.ts`, `src/ui/README.md` |

PanelUI Native supplies underlying components. Product screens consume bycoda
facades; extend an existing facade for a reusable missing capability. Direct
upstream imports belong in shared implementations, preferably from individual
component subpaths. Do not
eagerly import the full upstream barrel or component gallery into startup.

## Color and appearance

Use `colors`, `semanticColors` or generated semantic utilities. Add a missing
role in `tokens.ts` for both palettes, regenerate CSS and check contrast.
Do not invent feature-local hex colors, tints or gradients.

| Role | Use |
| --- | --- |
| `background` | Application canvas (step 1) |
| `panel` | Code blocks, pressed rows in dark (step 2) |
| `raised` | Composer, chips, sheets, pressed rows in light (step 3) |
| `fill`, `elevated` | Control/search fills and floating or selected control surfaces |
| `text` | Primary content |
| `muted`, `subtle` | Supporting readable text |
| `tertiary` | Decorative glyphs such as chevrons; never body text |
| `border`, `separator` | Hairline (`StyleSheet.hairlineWidth`) field outlines and row dividers |
| `accent` | Interactive foreground and action glyphs |
| `accentSolid`, `primaryText` | Filled primary control and label |
| `selected` | Selected content surface |
| `info`, `success`, `warning`, `danger` | Actual semantic feedback |
| `semanticColors[tone]` | Matching status text, surface and border |
| `userMessage`, `scrim` | Conversation bubble and modal backdrop |
| `terminalAnsiPalettes[mode]` | The 16 ANSI base colours for captured terminal output only, never UI or status |

Surfaces use three layered steps: `background` < `panel` < `raised` (dark `#0B0B0C`/`#131316`/`#1A1A1E`,
light `#FCFCFD`/`#FFFFFF`/`#F4F4F6`); `fill` is the input/quiet control fill and `elevated` the
menu/floating fill. Use `pressedFill()` for pressed rows. Text is `#F5F5F7` (dark) and `#17171A`
(light). Borders are hairline, never 1.5px outlines. An input or composer frame is a constant 1dp in every
state; focus and error change only its color, so the field never resizes. Tabs communicate selection
with text contrast and weight, without colored strips on any edge. Focus, selection and
status feedback retain their semantic colors; neutral
large resting fills stay within the three steps. Keep
system/light/dark preference working from the lock screen onward. Theme changes
must update mounted content without resetting forms, focus or drafts.

Call `useMobileTheme()` in renderers reading native inline colors. Reusable
native styles use `createThemedStyles`. Never capture a resolved color in a
module-level object or static `StyleSheet.create` call.

```tsx
import { View } from "react-native";
import { Body } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { createThemedStyles } from "@/ui/themed-styles";
import { colors, space } from "@/ui/tokens";

const styles = createThemedStyles(() => ({
  summary: { backgroundColor: colors.panel, padding: space.lg },
}));

export function Summary({ title }: { title: string }) {
  useMobileTheme();
  return <View style={styles.summary}><Body>{title}</Body></View>;
}
```

## Type, spacing and shape

These are current token values. Import tokens instead of copying these numbers
into feature styles. Native layout uses density-independent units; text retains
system scaling.

| Family | Current values |
| --- | --- |
| Spacing | `xxs` 2; `xs` 4; `sm` 6; `row` 10; `md` 12; `lg`/`screen` 16; `xl` 20; `xxl` 28; `gapIcon` 8 |
| Type (size/line) | `micro` 11/14; `caption`/`badge` 12/16; `small` 13/17; `control` 14/19; `body` 15/21 (chat `lineHeight.message` 22); `input` 16/21; `title` 16/21; `heading` 18/24; `pageTitle` 22/28; `hero` 24/30; `display` 28/34; monospace code 12/`lineHeight.code` 18. Use the paired `lineHeight` map |
| Radius | `badge` 6; `control` 10; `card` 12; `preview` 14; `bubble` 18; `composer` 24; `sheet` 24; `pill` 999 |
| Visible sizes | `controlHeight`/`buttonHeight` 40; `inputHeight`/`composerFieldMin` 48; `visualControl` 32 (icon buttons, send); `chipHeight` 28; `toolRowHeight` 28; `sectionHeaderHeight` 32; `rowLeading` 32; `rowHeightSession` 56; `rowHeightProject` 52; `headerHeight` 48. The docked tab bar has no height token: it is a 48 target plus padding and the bottom safe area, and reports its measured height (`onInsetChange`) |
| Hit areas | `touchTarget`/`iconTarget` 48. Header Back, Sheet Close and composer toolbar controls reserve 48 dp in layout. Compact visible controls can expand into space their parent leaves available. |
| Icons (`iconSize`) | `inline` 14 (in a text line); `status` 16 (status/notice glyph); `row` 20 (list row leading glyph); `action` 20 (header/toolbar icon button); `back` 24 (navigation chevron); `check` 16 (the selected mark of a choice row, chip or menu item) |
| Rhythm (`rhythm`) | `group` 28 from the previous group to the next section label; `headerLeadIn` 4; `headerGap` 4 |
| Other | Multiline input minimum 96 |
| Width | Content 760; entry surfaces 520 |
| Motion | Press 120ms; reveal 220ms; sheet 280ms |

Use `Body`, `Heading`, `CodeText` and shared `uiStyles`. Keep the system text face
and shared monospace role. Avoid fixed text heights and truncation hiding
essential values. Wrap long localized labels or move secondary metadata to a
second row. Compact density shrinks the visible control and padding; the hit area stays 48.

Shared buttons use the control radius; search is a pill (`radii.pill`) that reserves 48 in layout. Presentation belongs in the shared owner.
NavigationGroup is an unboxed collection with aligned rows; RecordCard separates record
identity, visible status and optional retained details through spacing. Reserve Card
for a meaningful task group, and avoid nesting cards for ordinary metadata.
Screen titles are 22/28 left-aligned (`uiStyles.pageTitle`, `fontSize.pageTitle`), without large-title collapse.
A title hoisted into the native top row beside Back uses the native title size 16/21 (`uiStyles.title`); it
measures itself and gives the row back rather than ending in an ellipsis.
`ScreenHeading` owns the compact 48 identity/action row, and the tab navigator's `headerIdentity` combines the title
and computer selector in one 48dp-or-larger target. Counts belong to its secondary
context. Native-title screens suppress only the duplicate content title, preserving
context and actions. Reserve hero treatment (`uiStyles.largeTitle`) for intentional
entry or overview content such as the welcome screen; body and form controls keep their readable scale.
The bottom navigation is a centered, content-width icon dock above the bottom safe
area. Its panel surface has a 1dp border, 24dp corners, 6dp padding and soft shadow.
Each destination has a 48dp icon-only target with an accessible label; selection
uses text-colored artwork and a 4dp accent dot, without a filled tab background.
The new-session command follows the destinations after a plain gap, without a
divider. The voice assistant is not in the dock: on tab pages its waveform button
sits at the far right of the title row (large title, page actions, then the
waveform; the computer and project pills sit on the context row below), supplied once by the tabs layout as
`ScreenChromeProvider headerTrailing` (`AssistantEntryButton`). Tap it to open the
assistant; its dot shows call state and its label names a running call. Narrow widths and
large system text move destinations into the More sheet. Running counts remain
visible and accessible there. The keyboard controller hides the dock; its measured
footprint reserves content and toast clearance. Dock artwork is tintable PNG alpha
from `assets/dock-icons/`, rendered by `src/ui/dock-icon.tsx`.
Conversation chrome reserves useful identity width before placing its action
group; the group can move as a unit at narrow widths. Running Stop remains
direct. Keyboard visibility combines status and scope into one text flow without
remounting workspace, transcript, composer or action owners. Keep essential
context readable.
The composer gives text its own full-width row and places one non-wrapping toolbar
below it (attachment, model chip, microphone, send/stop), visible at rest as well. Its fill and perimeter remain stable on focus; editable fields
keep local focus cues and the caret.

## Choose components by task

| Task | Product component | Rule |
| --- | --- | --- |
| Command | `Button` | Use `label`, `tone`, `busy`, `disabled` |
| Icon command | `IconButton` | Supply an accessible localized `label` |
| Actionable card | `PressableCard` | Preserve selection/expansion semantics |
| Text editing | `Input`, `Field`, `IdentifierField` | Visible labels, suitable keyboard, inline errors |
| Boolean setting | `ToggleField` | Explain consequences when needed |
| Short peer view/value | `SegmentedControl`, `ChoiceChip` | Explicit selected state |
| One/many options | `SelectField`, `MultiSelectField` | The label and current value share a row that opens a picker Sheet. Search appears on long lists |
| Suggested text or remote options | `AutocompleteField` | Type in the picker search. Commit a suggestion or explicitly choose the typed text when allowed |
| Settings navigation | `NavigationGroup`, `NavigationRow` | Group related destinations and values |
| Collection | `ScreenList`, `SearchField` | Stable rows, query state and refresh |
| Editor/confirmation | `Sheet`, `FormActions`, `confirmAction` | Guard dismissal and show async feedback; no inline confirmation cards |
| Feedback | `QueryState`, `MutationState`, `StatusLine`, `Notice`, `ErrorNotice`, `showToast`, `Badge` | Actual state and useful recovery |

Two or three segmented choices share the available width and allow their labels to wrap
inside each target. Keep every peer visible; a horizontal scroller must not hide
the final choice. Four or more choices use the facade's labeled selector rather
than a progressively denser segmented row. Preserve selected and disabled behavior
when changing presentation.
| Secondary actions/help | `ActionMenu`, `Disclosure` | Frequent actions stay directly reachable |

Actual component props are authoritative. Mobile Button uses `busy`, not an
assumed `loading` prop from another library. Do not duplicate shared controls
with raw styled `Pressable`, `TextInput` or `Switch` inside feature code.

## Screen and form composition

Use `Screen` for ordinary content and `ScreenList` for growing collections.
Preserve virtualized transcript/list architecture; do not put another ScrollView
around every route. `ScreenChromeProvider` coordinates native titles and insets.
Avoid duplicate titles, safe-area padding and keyboard managers. Respect shared
content widths on tablets and wide previews.

Keep one heading, a compact action area and a clear content flow. Collection
search and scope belong near the collection. Disclose secondary filters/options
without obscuring applied state. Prefer separators/grouping before another card.
**One search and filter convention.** A collection's search and filters live in
one sheet, never in rows of the page. The page's heading row (scope pills on the
left) ends with the search icon (accent while a query is active), the filter icon
(sliders with a dot for applied filters, only when the list has filters) and the
create action, in that order. Both icons open the same `Sheet size="compact"`: it
sizes to its content up to the available height and scrolls beyond it, with
PanelUI's `SearchBar` (clear x, no Cancel word) on top and the filters below
(status chips wrap, toggles, selects). Choices apply live so the list behind
narrows while the person types; the action area offers Reset (only while
something is applied; clears search and filters) and Done. The search icon opens
it with the keyboard focused on the field. No inline chip row, no "Status: …"
summary row and no row for one or two icons. Owner: `useCollapsibleSearch(field,
{ filters, activeFilters, onResetFilters })` in `src/ui/search-field.tsx`;
management lists use `useManagementToolbar`. `SearchToolbar` keeps the same icon
and sheet for panels that already have a toolbar row of other actions;
`collapsible={false}` keeps a field that is a screen's primary task inline.
Provider records (the Inbox and the Pull requests list) share one filter body,
`InboxFilterFields`: the desktop Inbox filter menu's set, applied at once. The Sheet facade owns privacy, Back and keyboard; it does not yet
drag to expand. Other fields keep a useful intrinsic width and secondary actions
wrap together. Ordinary
`NavigationRow` instances are flat; use `variant="card"` only for a distinct task.
Navigation rows disclose destinations, selection rows show the selected choice,
and commands omit the navigation chevron through their explicit `intent`.

Preserve field values on validation/server failure. Show field errors beside
fields and operation errors near submit. Sheet content scrolls independently of
its explicit `footer` and descendant `FormActions`, which share the action area
outside the scroller. Actions retain their latest labels, pending state and
callbacks from the editor. Outside a Sheet, `FormActions` renders inline. Use
this shared composition rather than a feature-local sticky footer. Pass `dirty`
and use the existing guard for unsaved changes. Preserve Back, return focus,
keyboard behavior and dismissal rules during pending work.

Pass operation-level feedback through `FormActions.feedback` so save failures,
uncertain outcomes and recovery stay beside the current actions. Field errors
remain in the form. Long operation feedback has its own bounded scroll region;
it must not push required actions out of the available viewport. Screen and
ScreenList share `ScreenHeading`: native title ownership hides only the repeated
title, never the screen's actions. Route and tools-menu section labels use
`src/features/management/sections.ts` as their common source.

`ProjectDirectoryFeedback` is the single explanation owner for directory
loading, reconnection and privacy synchronization in scope/project/session/tool
gates. Precise query errors take precedence so auth/identity recovery is retained.
Row operations report beside their target record; a list-level fallback remains
available when the target is filtered, outside the rendered batch, on another
page or unavailable during loading. Decide visibility in the final pagination
owner, not from the unfiltered source collection. Pending feedback follows the
same ownership rule as failures, and changing sections must not lose recovery.
Mutation success is a quiet live
text acknowledgment. `IssueSummary` groups partial source/provider failures with
all distinct details retained; one failure stays immediately visible.

`confirmAction` keeps consequential actions behind confirmation. Its default
cancel label follows the current locale. Callers explicitly pass `"default"`
intent for ordinary start/approve/resume operations; destructive intent remains
the compatibility default for deletion/discard/stop operations. Presentation
never supplies or authorizes the callback.

One confirmation pattern per weight: `confirmAction` (native alert) confirms one
decision about one known thing in a sentence or two (sign out, delete account,
discard changes). `Sheet` + `FormActions tone="danger"` is for a review that must
stay valid while the data behind it can change (saved computers, local drafts,
data-sharing consent): it shows what will be affected and retires itself when
that changes; non-destructive reviews (merge, commit, push) keep the default
primary tone. There is no third, inline confirmation card: the retired
`ConfirmationCard` must not return. Destructive rows that open either use `intent="command"`, never a
navigation chevron. Settings pages are pushed routes, so these sheets never stack
on a settings sheet.

## States, accessibility and motion

Provide default, pressed, selected, disabled, busy and error states wherever
applicable. Busy actions prevent duplicate requests. A failed operation must not
look successful; an authorization failure must not look like an empty collection.

Pair color with text/semantics. Preserve screen-reader labels, selected/expanded/
checked state, visible web focus, text scaling and keyboard navigation. Important
errors, code and identifiers remain copyable where appropriate. Hover and long
press must not be the only ways to discover an action.

Use shared motion helpers and system reduced motion. Keep transitions brief;
avoid permanent decorative animation. Private content must disappear immediately
on lock; security visibility takes priority over exit animation.

### States

One language for every state; use the shared owners in `src/ui/`, never ad hoc text.

Errors are quiet and small. Pick the presentation by severity, one reporter per failure:

| Level | When | Presentation | Height |
|---|---|---|---|
| Silent | Transient read failure inside its retry budget, failed background refresh under shown data, link drop, timeout or unknown Host reply within the 6 s grace (`READ_RETRY_GRACE_MS`, one automatic retry) | Nothing; the skeleton or data stays | 0 |
| Ambient | Link down, reconnecting, offline that outlasts the grace (a proven connection reads "connected" through a shorter blip) | Computer pill only | 0 extra |
| Status line | Slow read after the grace, data stale after 2 failed refreshes spanning 15 s or after 60 s, a later section whose failure the first section already reports, a waiting send | `StatusLine`: icon, one line, optional text action, no fill | 24 pt |
| Toast | Result of a quick action with no form on screen (copy, pin, refresh) with Retry or Undo; never an uncertain write | `showToast({ action })`: 4 s, 6 s with an action | about 48 pt, no push |
| Actionable toast | App-level notice whose review or cancel actions must stay available, such as diagnostic sharing | `ActionableToast` uses the shared toast card and measured bottom clearance. The feature owns timing and dismissal. | Wraps to fit text and actions |
| Inline notice | Failed submit in a form, sheet or review; uncertain write; a caution to read before acting | `Notice`/`ErrorNotice` beside the action, one per action area, clamped to 2 lines with Details | 61 pt collapsed |
| Section state | A section of a screen or sheet that cannot show anything | `StateView size="compact"` | 96 pt, 128 pt with an action |
| Region state | A whole screen, list or sheet body with nothing to show | `StateView size="region"` | error 200 pt; first-run, unpaired and empty art up to 340 pt |
| Blocking | Lock, consent, destructive or discard confirmation, render crash (root `ErrorBoundary`, `SectionErrorBoundary` in sheet bodies) | Sheet, dialog or full screen | n/a |

Auth, identity, unsupported and offline show at once; every other failed first load waits for the grace.
Illustrations are for first run, unpaired and empty, never for errors: `StateView` draws error art
(error, unreachable, offline, locked) as the small tone icon. Within one `Screen`, `ScreenList` or
`Sheet` the first failing `QueryState` owns the message and a Retry that retries every failed read;
later failing sections show one status line. `QueryState` picks `size` by default from that ownership
and its loading shape (list/content/centered: region; inline/none: compact); pass `size` to override.

| State | Presentation (owner) |
|---|---|
| Empty, first run, not connected, unreachable, locked, no permission | A region-sized `QueryState` empty state defaults to the `inbox-empty` mascot unless the caller passes its own art; search/filter misses use `NoResults`. `StateView`: `size="region"` centers its title, optional illustration (first run, unpaired, empty only) and recovery action. `size="compact"` (or `compact`) for subsections: one inline icon, title, at most two lines and a compact action. `size="line"` is one `StatusLine`. `Empty` defaults to the compact form. |
| Initial load | `QueryState` `loading`: `"list"`/`"content"` skeleton of the content shape (rows with tile, title and meta; or heading and lines), `"centered"` spinner plus label only when the shape is unknown. Never both, and no visible "Loading…" text above a skeleton: `loadingLabel` is announced only. Placeholders appear after 250 ms (`useDelayedVisible`), so fast or cached loads never flash: `Skeleton` reserves its region at once but draws its shapes only after the delay, and a read's inline spinner (`Loading delayed`, used by `QueryState`) waits the same way. A quiet reconnect without data keeps the same skeleton; the computer pill shows the link. A scope control (project pill) never renders a `StateView`: it would stretch its toolbar row and slide the row's actions. Spinners stay for in-place actions (button, row, connecting). |
| Refresh | Pull-to-refresh (shared `usePullRefresh`, held at least 400 ms so it dismisses cleanly) or progress line; no blocking UI. |
| Failed load, no data | After the grace, `QueryState` renders a `StateView` without art: a tone icon, a title from the error kind, the message (clamped) and Retry or the repair action. |
| Failed or paused refresh, data shown | Keep the data and stay silent. The computer pill carries link outages. After 2 consecutive failed refreshes spanning at least 15 s, or 60 s, a warning `StatusLine` offers Refresh; a Refresh that fails again raises a toast. |
| Waiting for a connection, no data | `QueryState` renders a `StateView` "Waiting for a connection" with Manage connections; reconnecting without data keeps the skeleton (a `StatusLine` lead only for a slow read on a connected computer). |
| Feedback tied to a user action (form, sheet, dialog) or a contextual explanation to read before acting | `Notice`/`ErrorNotice` with tone, never for connection, loading, availability or "not available yet" (use `StateView`), and never stacked with a `StateView` in one region: tinted surface, hairline border, 16px icon, message clamped to 2 lines with a Details toggle, quiet recovery action. |
| Field validation | `Field`/`ErrorText` use `FieldError`: 13/17 danger text with a 14px icon; the input border turns danger. |
| One spinner per operation | Busy `Button`/`IconButton` claim the spinner through `useSoleSpinner` (`src/ui/spinner-claim.ts`): the newest busy control draws it, any other stays busy (disabled, announced) without a second glyph, so a toolbar menu and a Retry button refetching the same data never show two identical spinners. Different kinds (skeleton, progress line, one spinner) may coexist. Never hand-draw a busy glyph beside a `busy` control. |
| Submitting | Busy `Button` keeps its label; siblings disable; `MutationState` adds no second indicator inside `FormActions`. |
| Success | `MutationState success` raises a toast (`showToast`, `useSuccessToast`) when `ToastHost` is mounted, otherwise a success `Notice`. A quick row action reports its result, Retry or Undo with `showToast({ action })`. |
| Dirty | `FormActions dirty` and `Sheet dirty` show the `UnsavedBadge` pill above the actions; leaving still goes through the Sheet guard. |
| Offline, reconnecting, unreachable, access | The computer pill status only; no app-chrome banner and never per-row errors. A region with nothing to show uses a centered `StateView`. |

Titles are human sentences; the specific error text goes in the description.
Illustrations are decorative and hidden from screen readers; the title carries the meaning.

## Conversation presentation

Use the shared message renderer and chat facades for transcripts and appearance
previews. Keep prose, bold emphasis and headings neutral; use hierarchy and
spacing for reading order. Inline code uses the existing accent on a code fill
with monospace type, while links retain their link affordance: accent text led
by a one-em icon of what they open (`linkIconKind`: web, local server,
conversation); file references are tinted chips. Quote rails may
use the informational tone. Do not recolor arbitrary words or infer sentiment.
Transcript prose reads at 16/24 in the standard chat size (`chat-styles.ts`),
one step above app body text.

The conversation's live status floats in one capsule above the composer
(`FloatingStatusCapsule`, `src/ui/floating-status.tsx`: system glass on iOS 26,
the `popover` surface elsewhere): run state, provider goal, subagents and queue,
hairline-separated, each segment opening what it summarises, with the circular
back-to-latest button above it while scrolled up. The transcript's live row owns
the clock while on screen; the capsule shows it only once that row is out of
sight. The list reserves the cluster's and the floating header's measured
heights; the content scrolls under short background fades at both edges.

Activity color must accompany a truthful localized status. Terminal canonical
states take precedence over stale streaming flags; a settled record must not
keep announcing that it is writing. A Sheet inspection trigger is a button,
whereas an inline disclosure owns its actual expanded state. Preserve bounded
source inspection, raw copy behavior and the selected reading size in the full
reader. Task-list marks in assistant content describe source text; they are not
new mutation controls.

Keep the outer touch target stable during press feedback. Animate only the
inner visual, and stop spatial feedback when busy, disabled or reduced motion
changes. Use the reactive reduced-motion owner; do not animate virtualized
message entrances or remount a transcript to restyle it.

## Acceptance

Review narrow/wide layouts, long content, supported languages, both themes,
dynamic text and reduced motion. Exercise relevant loading, empty, offline,
failure, retry and pending states. Shared-control changes need representative
existing consumers as well as the new use case.

Source checks and browser previews support implementation review. Native
keyboard, gestures, OS Back, screen readers, lock transitions and physical-device
behavior require native acceptance. The offline tour grants no host access and
does not authorize sends or publication.


## Compact task composition

Card defaults to an unboxed, aligned task group. Nested Card groups do not add
another horizontal gutter or multiply vertical insets. Use `variant="surface"`
only when a genuinely independent task region needs a raised surface; inputs,
code and media viewports retain their own boundaries. This avoids treating every
metadata block as another large card. Buttons, icon actions, selection rows and
list rows retain 48dp+ hit areas (rows are at least 52/56 high); pressed rows fill with
`pressedFill()` instead of scaling or fading (`useRowPress`/`rowPressMotion` in `src/ui/row-press.ts`, used by
`NavigationRow`, `PressableCard` and `SelectField` options; `ToggleField` paints the same fill). A choice row (`NavigationRow
intent="select"`, `SelectRow`, `SelectField` option) is a radio/checkbox with its checked state and one
`SelectionMark` (16 check, or a 20 box for multiple choice). Ordinary rows are flat: no card, inset hairline separators
(`NavigationRow` draws one inside `NavigationGroup`), 15/21 medium title and 13/17 muted meta.
Group rows under `SectionHeader` (see the rule table below). Primary option labels may grow instead of being clipped.

### Visual rules (one per intent)

Every screen applies these through the shared owner; feature code passes data, not metrics.

| Item | Rule | Owner |
| --- | --- | --- |
| Section header | 12/16 semibold muted label, no rule; count as a quiet regular number after the label, hidden at 0 (never "(0)"); trailing info/action at the end, centred in a 32 row; 4 lead-in. `flush` only for the first header of a container with nothing above it | `SectionHeader`, `Section` in `src/ui/layout.tsx`; `uiStyles.sectionHeader`/`sectionCount`/`sectionTrailing` |
| Group rhythm | 28 from the previous group to the next section label (Screen gap 16 + lead-in 4 + half the 32 header row); header to first row 4 + row padding | `rhythm` in `src/ui/tokens.ts`; `Screen`, `ScreenList` |
| Back / header | One bare chevron (24, 2.2 stroke iOS; arrow on Android) in a 48 target. Native stack headers render it as an item without the iOS shared glass capsule, so pushed pages match the conversation header; native title stays centred | `HeaderBackButton`; `stackBackItem`/`stackBackOptions` in `src/ui/stack-back.ts`; root `app/_layout.tsx` |
| Page top | One order on every page: title row (back + native title, or a tab's large title … page actions … the voice assistant at the far right) → one non-wrapping context row (computer pill, project pill, then `context`; each pill shrinks and ellipsizes, wrapping only from 1.35 font scale; the row is not drawn when empty; `identity="title"` on `Screen`/`ScreenList` omits the computer pill; the page's icon actions trail it in the order search, filter, refresh, more/service, add) → optional segmented control → a `SearchToolbar` row only when filters accompany search → content. A page whose only collection control is search puts the `useCollapsibleSearch` trigger in its actions and the open field below the scope row. `ManagementList` actions trail the scope row; only a page with no scope row under a native title moves them to the navigation bar. Owner-approved exception: Usage & limits pins its refresh, quiet "Updated HH:MM" time and error warning glyph in the native header's right side so they never scroll away. No row exists for a single icon, no duplicate refresh/more, no full-width dropdown for scope. Computer: every page that reads the active computer leads its scope row with the switchable `MachinePill` (status, saved computers, Manage computers), provided once as `ScreenComputerControl` and turned on by `computerSwitch` (default with an own `scopeControl`; `ManagementList` and computer `SettingsPage`s set it). A page bound to one computer (a session, a project, a project tool, a link for another computer) shows a read-only computer pill. Data reads the active computer only, so no page offers All computers; Machines and Account list every computer and carry no computer pill | `ScreenHeading` in `src/ui/layout.tsx`, `ScreenList`, `SearchToolbar`/`useCollapsibleSearch` in `src/ui/search-field.tsx`, `ManagementList` |
| Pushed page top row | When they fit, a pushed page shows Back, its title and its scope pills (computer, project) on the left of the native top row and its icon actions on the right: `ScreenHeading` hands them to the root stack through `ScreenHeaderRow`, and the native centred title is cleared. They fit when the screen width minus gutters, Back and one 48 slot per action leaves room for the whole title (about 9 pt a character) and about 92 pt per pill, with text at most 1.3×. Otherwise (long title, narrow phone, many actions, large text) the stack keeps title and Back and the pills with the actions take one compact row below; a page that stops fitting hands the row back. Lists with filters use one combined search-and-filter control to save a slot. Never inside a sheet | `ScreenHeading`, `fitsHeaderRow`, `ScreenHeaderRow` in `src/ui/screen-chrome.ts`, `HeaderRow` in `app/_layout.tsx` |
| Projects view options | The sort icon opens "Sort and view": sort order, grouping, paths and the Hidden groups entry (count once known), which closes the sheet and opens the hidden-groups password/list sheets. Hidden groups are never a row in the project list | `HiddenGroupsRow`, `HiddenGroupsFlow` in `src/features/group-lock/group-lock-section.tsx` |
| Project scope ("which project") | One shared selection for every page: `ProjectScopePill` passed as `scopeControl`, a 28 chip-height pill (folder glyph, name or All projects, chevron) beside the computer pill; it opens the shared project picker. One line, ellipsized within `SCOPE_PILL_MAX_WIDTH` (240). Only Tasks, Notes, Automations keep the default `allowAll`; other project pages pass `allowAll={false}` with `useRequiredProjectScope`. Pages whose content does not depend on a project carry no project pill: Tools home lists tools and lets project tools ask for a project; Sessions owns its own per-computer project filter in its list header (not the shared selection). Never a per-page project field, toolbar slot, filter-sheet row or route-private project; links adopt their project into the selection. The computer pill uses the same `ScopePill` | `ProjectScopePill`, `ScopePill` in `src/ui/scope-pill.tsx`, `useLocalProjectScope`, `useRequiredProjectScope`, `useAdoptProjectScope` |
| Model selection ("which model runs this") | One selection everywhere, mirroring desktop `ModelChoiceField`. The model list is always the shared picker: a "Model | Agents" segment (Agents holds advisor, subagents and image models when bycoda's own agents are offered) → the current model with its effort and Fast controls → search across every provider and account (shown above six distinct models; the same model under several accounts counts once; never auto-focused) → "Recent": up to three models recently started or saved on this computer that are still offered and not the current one ("Model" with "Provider · Account"), one tap picks them → a horizontal provider rail (product order Claude, Codex, OpenCode, Antigravity, then the rest; the session's provider stays on it with a loading or "could not be loaded" state while its list is empty) → account rows only when the provider has more than one account: `NavigationRow`s with the account colour mark, the browsed account selected, its quota when the computer's limits report knows it ("62% left", "Limit reached · resets 14:30"; an exhausted account stays selectable), signed-out and disabled accounts as disabled rows with the reason, and past four accounts the one in use plus "Other accounts (N)". On the session's provider an account row is a one-tap switch that keeps the model and settings (it only browses when that account does not list the model); on another provider it only scopes the list → that account's models. Picking another model keeps the reasoning effort in use when the new model offers the same effort label (a sparse new-session form only carries an effort the owner chose). Open sessions still apply on Save. Models a Host lists once per effort ("Gemini 4 Hydrogen (High)") fold into one row whose effort is chosen in the Reasoning control (`model-variants.ts`; only effort suffixes fold, Host ids stay unchanged). Hermes and OpenCode group models in collapsible upstream-vendor sections (the `provider` field, else the name before " · "). Work items whose Host contract stores `modelChoice` (tasks, goals, stewards, automations, crew members) add the segmented Use settings / Any model / Fixed control when the computer offers `models.routing.v1`; "Any model" picks the whole model order or a model group, previews the models it walks with the Host's "Next run uses …", says the model order and groups are edited on desktop (mobile never edits these computer defaults), and keeps the fixed model as a collapsed "Fallback model". Without the capability or a routing role, only the picker shows. A stored value round-trips: no `modelChoice` reads as Fixed and stays absent until another mode is picked; a crew member maps `selection`/`modelChoice` and keeps its first candidate as the fixed model. Sessions and new sessions are fixed-only (no `modelChoice`); subagent/advisor lists use the same grouping as multi-select. Never a screen-local model dropdown, flat model list or provider select | `ModelPicker`/`ModelPickerField`, `model-groups.ts`, `model-picker-accounts.tsx`, `recent-models.ts` in `src/features/workspace/`; `ModelSelectionField`, `FixedModelField`, `ModelChoiceField` in `src/features/workspace/model-selection/` |
| Page context ("which computer") | `scope={{ computer, project }}` on `Screen`/`ScreenList`: read-only 28 scope pills (laptop/folder glyph, one ellipsized name, no chevron) at the start of the scope row, spoken as "Computer: …". A `scopeControl` (or the route's `ScreenScopeControl`, set by project tool routes) replaces the static project pill with the shared project pill. Do not hand-build "a · b" subtitles or caption lines; `ScopeLine` remains only for sheets | `ScopePills`/`ScopeLine` in `src/ui/scope-line.tsx`, `ScreenHeading`, `ScreenScopeControl` in `src/ui/screen-chrome.ts` |
| List rows | 52 min (56 with a detail line), 10 vertical padding, 15/21 medium label, 13/17 muted detail, inset hairline separator in a group. Leading content sits in a 32 slot so labels align across glyphs, provider marks and avatars. Picker options and record titles use the same measure | `NavigationRow`, `ValueRow`, `SegmentedRow`, `ToggleField`, `SelectField` row and options, `RecordCard`; `uiStyles.rowLeading` |
| Leading icons | 20 muted Lucide glyph, 1.8 stroke, no tile or fill; danger rows tint it. Provider marks 20. Menu rows (`ActionMenu`/`ActionList`) and the computer menu use the same measure | `RowIcon` (`SettingIcon` is an alias) in `src/ui/navigation-row.tsx` |
| Status | The normal/healthy state is quiet muted text (`StatusText` default tone, no dot) or nothing. Running/info/warning/danger use `StatusText` with its tone colour and 6 dot. A tinted `Badge` is only for an exception the user must act on or notice in a list (failed, unavailable, needs you, draft) | `StatusText`, `Badge` in `src/ui/feedback.tsx` |
| Section empty state | `StateView size="compact"`: neutral is the row's body text, muted and regular, no glyph or art, aligned with the rows; a toned one leads with its 16 status glyph and a 15/21 medium title. It is not announced as a heading (only region states are). Optional compact action below. Region art stays for a whole empty screen | `StateView` in `src/ui/state-view.tsx`, `Empty` |
| No results | A search or filter that empties a collection: the search mascot, the list's own "No … match your search." wording (else "No matching results" / "No items match these filters") and the recovery as the primary action: Clear search while a search is active, else Clear filters (Clear filters becomes the quiet second action when both apply). Pickers and small sheets use `compact` (same words and action, no mascot). Auxiliary rows (locked groups) step aside while a search is active | `NoResults` in `src/ui/no-results.tsx`; `QueryState noResults` |
| Card vs flat | Lists are flat rows in `NavigationGroup`; `Card variant="surface"` only for an independent task region (meters, a review) | `NavigationGroup`, `Card` |
| Readings / metrics | One row per reading: label left, muted tabular value right; a share of a capacity adds a small bar under the same row (accent, amber from 80%, red from 90%); sizes and counts get no bar; unknown readings are omitted, not "–" | `ValueRow` (`children` slot) in `src/ui/setting-rows.tsx`; PanelUI `Meter` |
| Disclosure (accordion) | Collapse only content that is both long (several rows, a list, a log, a diff, a long description or raw error output) and rarely needed: advanced editor fields, technical lists, full files. Never wrap one or two rows, an address, one or two identifiers, a single sentence or a single action in a disclosure: show identifiers as a muted mono selectable line, put a help sentence behind the info icon (or one muted caption), and keep actions as rows. A lone help link is one `NavigationRow` to the help page, not an accordion with one sentence and a button. Raw error text of unknown length may stay behind Details under a visible summary. Paths that are deliberately hidden for privacy (desktop preference context) keep their disclosure | `Disclosure` in `src/ui/disclosure.tsx`; `HintLabel`, `Field info`, `useInfoHint` in `src/ui/info-hint.tsx` |
| Saved computers | Each row: laptop glyph, name, one toned status (selected computer only, from `ActiveComputerStatus`) with the quiet connection type after it, an accent check on the selected computer and the same "…" options control on every row. The computer sheet shows status and the selectable address inline, then icon rows: Use computer (only when not selected), Retry/Scan QR code, Edit connection, Remove (danger, opens the removal review). The edit form is titled "Edit connection" by the screen header | `MachinesScreen`, `ActiveComputerStatus` in `src/features/connections/` |
| Menus | Never a one-item menu: `ActionMenu` renders a lone action directly (icon button if it has an icon, else a quiet text button); a lone destructive action keeps the menu unless flagged `reviewed` (it opens its own confirmation). A boolean is a `ToggleField` row, not a menu item | `ActionMenu` in `src/ui/overflow-menu.tsx`, `singleMenuAction` |
| Row actions | Rows never swipe. A record's actions open from its options control: the visible "…" where the row already shows one (notes, management records) or a long press with the named "… options" accessibility action (projects, sessions, changed files). A tap on a row always opens it. Horizontal rails (chip rows, breadcrumbs) scroll only when they overflow and never bounce or glow; code, diffs and tables keep their horizontal scroll | `SwipeActions` (pass-through) in `src/ui/swipe-actions.tsx`, `ActionMenu`, `RowOptionsSheet`, `PressableCard onLongPress` |
| Session rows | Provider glyph (unread dot on it) → title, led by a filled accent pin when pinned → trailing column: time (one unbreakable label such as "44 min") or one status. Type marks (assistant-managed) sit at the start of the meta line. The meta line omits the project while a project is selected in the pill and omits `main`/`master` on a primary checkout; worktrees and other branches show. Repeated provider prefixes ("codex · codex · …") are stripped from titles. Sessions lists every project of the active computer under Pinned, Needs you, Working, Recent and a folded Settled shelf (collapse persisted), or one collapsible section per project when grouped. Density is compact (48dp, one line, no meta), standard (project and branch) or detailed (model, work item, managed mark); large text wraps every density. Density, grouping, collapse and the per-computer project filter persist in app preferences | `SessionListRow`, `sessionRowLayout`, `sessionDisplayTitle`, `sessionSectionRows`, `projectGroupedSessionRows` |
| Session actions | One owner for a session record's actions (settle, pin, rename, read state, snooze, move to folder, copy/share, details, archive, stop, delete) in desktop order with the same reviewed-authority checks, confirmations and Undo toasts. The list row opens them as its options sheet; the open session lists the same rows in its options menu after the session tools, and deleting the open session confirms and then returns to where it was opened from (or the sessions list) | `useSessionActions` in `src/features/workspace/session-actions.tsx`, `SessionRowActions`, `SessionToolbar` |
| Send while the agent runs | Tap uses the Settings default (Steer or Queue), whose glyph the Send button shows (steer arrow or queue list). Long press, also exposed as the named "Choose how to send" accessibility action, opens a small Steer now / Queue popover anchored above the button (keyboard stays open) with the default checked; the pick applies to that message only. It appears only when both can be delivered and closes when the run ends. With an empty draft the same slot is a single Stop | `ComposerSendButton`, `AnchoredMenu`, `busyPrimaryMode`, Settings → Messages |

Collapsed task records lead with title, status and a directly named session icon.
Stop, pending operations and actionable failures stay visible. Completion and
restart/repair actions use the existing record menu. Expanded task content leads
with instructions; execution locations, statistics and evidence use disclosure.
Long forms keep both initial review actions and final confirmation in the shared
action area, with current feedback beside the action.

Compact empty states share the screen/list content alignment. Do not add a
second horizontal gutter or a centered introductory block for an ordinary empty
collection or search result. Keep existing readable type, complete growing
messages and a 48dp action; explicit expanded entry treatments may be centered.
Loading, failed reads and true emptiness retain distinct semantics and recovery.

Warning/error explanations receive useful width at large text sizes. Recovery
actions may wrap below the explanation; do not squeeze it into a narrow column
to keep a short button beside it. Keep complete messages, actionable cautions,
48dp targets and the existing pending/permission/operation authority.

Preference summaries use a precise task label and the current selected value.
Current values and permission statuses may grow at large text sizes and must not
be ellipsized as previews. Retain the existing editor, stored values and authority.

Preference feedback distinguishes reading stored state from saving a user
choice. Use a named pending state, an unavailable/unsaved summary when relevant,
and recovery owned by persistence. Keep the initiating explanation during retry;
never describe an unread default as a saved preference or silently overwrite it.

Local search follows the active product language and retains its draft when a
collection refreshes to empty. Clear-search recovery restores focus to the same
field. Browser focus-induced scrolling must not dismiss that field; preserve
platform-native keyboard dismissal in the shared scrolling owner. Missing
optional metadata must not become a literal undefined value in rows or search.
