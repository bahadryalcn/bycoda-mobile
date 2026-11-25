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
buttons, grown with `hitSlop` or padding). Editable inputs and search fields reserve
48dp in layout so their native focus target does not depend on overlapping hit areas. Do not copy desktop
pixel sizes, CSS, Arc runtime or overlay infrastructure.

Avoid nested decorative cards, repeated introductions, permanent help paragraphs
and competing primary buttons. Keep labels, validation, approval requirements,
connection state and recovery visible. Optional inline help uses `Disclosure`.
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

Surfaces use three layered steps: `background` < `panel` < `raised` (dark `#0B0B0C`/`#131316`/`#1A1A1E`,
light `#FCFCFD`/`#FFFFFF`/`#F4F4F6`); `fill` is the input/quiet control fill and `elevated` the
menu/floating fill. Use `pressedFill()` for pressed rows. Text is `#F5F5F7` (dark) and `#17171A`
(light). Borders are hairline, never 1.5px outlines; focus may raise a field to 1px accent. Tabs communicate selection
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
| Type (size/line) | `micro` 11/14; `caption`/`badge` 12/16; `small` 13/17; `control` 14/19; `body` 15/21 (chat `lineHeight.message` 22); `input` 16/21; `title` 16/21; `heading` 18/24; `hero` 24/30; `display` 28/34. Use the paired `lineHeight` map |
| Radius | `badge` 6; `control` 10; `card` 12; `preview` 14; `bubble` 18; `composer` 24; `sheet` 24; `pill` 999 |
| Visible sizes | `controlHeight`/`buttonHeight` 40; `inputHeight`/`composerFieldMin` 48; `visualControl` 32 (icon buttons, send); `chipHeight` 28; `toolRowHeight` 28; `sectionHeaderHeight` 32; `rowLeading` 32; `rowHeightSession` 56; `rowHeightProject` 52; `headerHeight` 48; `tabBarHeight` 52 |
| Hit areas | `touchTarget`/`iconTarget` 48. Header Back, Sheet Close and composer toolbar controls reserve 48 dp in layout. Compact visible controls can expand into space their parent leaves available. |
| Icons (`iconSize`) | `inline` 14 (in a text line); `status` 16 (status/notice glyph); `row` 20 (list row leading glyph); `action` 20 (header/toolbar icon button); `back` 24 (navigation chevron) |
| Rhythm (`rhythm`) | `group` 28 from the previous group to the next section label; `headerLeadIn` 4; `headerGap` 4 |
| Other | Multiline input minimum 96 |
| Width | Content 760; entry surfaces 520 |
| Motion | Press 120ms; reveal 220ms; sheet 280ms |

Use `Body`, `Heading`, `CodeText` and shared `uiStyles`. Keep the system text face
and shared monospace role. Avoid fixed text heights and truncation hiding
essential values. Wrap long localized labels or move secondary metadata to a
second row. Compact density shrinks the visible control and padding; the hit area stays 48.

Shared buttons use the control radius; search is a 40 high pill. Presentation belongs in the shared owner.
NavigationGroup is an unboxed collection with aligned rows; RecordCard separates record
identity, visible status and optional retained details through spacing. Reserve Card
for a meaningful task group, and avoid nesting cards for ordinary metadata.
Screen titles are 24/30 left-aligned (`uiStyles.pageTitle`), without large-title collapse.
`ScreenHeading` owns the compact 48 identity/action row, and the tab navigator's `headerIdentity` combines the title
and computer selector in one 48dp-or-larger target. Counts belong to its secondary
context. Native-title screens suppress only the duplicate content title, preserving
context and actions. Reserve explicit `LargeTitle`/hero treatment for intentional
entry or overview content; body and form controls keep their readable scale.
The bottom navigation is a centered, content-width icon dock above the bottom safe
area. Its panel surface has a 1dp border, 24dp corners, 6dp padding and soft shadow.
Each destination has a 48dp icon-only target with an accessible label; selection
uses text-colored artwork and a 4dp accent dot, without a filled tab background.
Voice assistant and new-session commands sit together inside the dock after a
divider. Tap the waveform to open the assistant. Its dot shows call state. Narrow widths and
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
| Editor/confirmation | `Sheet`, `FormActions`, `ConfirmationCard` | Guard dismissal and show async feedback |
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
Use `SearchToolbar` when search shares a region with filters/overflow: search
keeps a useful intrinsic width and secondary actions wrap together. Ordinary
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
that changes. Destructive rows that open either use `intent="command"`, never a
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
| Ambient | Link down, reconnecting, offline | Computer pill only | 0 extra |
| Status line | Slow read after the grace, data stale after 2 failed refreshes or 60 s, a later section whose failure the first section already reports, a waiting send | `StatusLine`: icon, one line, optional text action, no fill | 24 pt |
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
| Empty, first run, not connected, unreachable, locked, no permission | `StateView`: `size="region"` centers its title, optional illustration (first run, unpaired, empty only) and recovery action. `size="compact"` (or `compact`) for subsections: one inline icon, title, at most two lines and a compact action. `size="line"` is one `StatusLine`. `Empty` defaults to the compact form. |
| Initial load | `QueryState` `loading`: `"list"`/`"content"` skeleton of the content shape (rows with tile, title and meta; or heading and lines), `"centered"` spinner plus label only when the shape is unknown. Never both, and no visible "Loading…" text above a skeleton: `loadingLabel` is announced only. Placeholders appear after 250 ms (`useDelayedVisible`), so fast or cached loads never flash. A quiet reconnect without data keeps the same skeleton; the computer pill shows the link. A field-level control (project scope) never renders a `StateView`: it would stretch its toolbar row and slide the row's actions. Spinners stay for in-place actions (button, row, connecting). |
| Refresh | Pull-to-refresh or progress line; no blocking UI. |
| Failed load, no data | After the grace, `QueryState` renders a `StateView` without art: a tone icon, a title from the error kind, the message (clamped) and Retry or the repair action. |
| Failed or paused refresh, data shown | Keep the data and stay silent. The computer pill carries link outages. After 2 consecutive failed refreshes or 60 s, a warning `StatusLine` offers Refresh; a Refresh that fails again raises a toast. |
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
with monospace type, while links retain their link affordance. Quote rails may
use the informational tone. Do not recolor arbitrary words or infer sentiment.

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
`pressedFill()` instead of scaling. Ordinary rows are flat: no card, inset hairline separators
(`NavigationRow` draws one inside `NavigationGroup`), 15/21 medium title and 13/17 muted meta.
Group rows under `SectionHeader` (see the rule table below). Primary option labels may grow instead of being clipped.

### Visual rules (one per intent)

Every screen applies these through the shared owner; feature code passes data, not metrics.

| Item | Rule | Owner |
| --- | --- | --- |
| Section header | 12/16 semibold muted label, no rule; count as a quiet regular number after the label, hidden at 0 (never "(0)"); trailing info/action at the end, centred in a 32 row; 4 lead-in. `flush` only for the first header of a container with nothing above it | `SectionHeader`, `Section` in `src/ui/layout.tsx`; `uiStyles.sectionHeader`/`sectionCount`/`sectionTrailing` |
| Group rhythm | 28 from the previous group to the next section label (Screen gap 16 + lead-in 4 + half the 32 header row); header to first row 4 + row padding | `rhythm` in `src/ui/tokens.ts`; `Screen`, `ScreenList` |
| Back / header | One bare chevron (24, 2.2 stroke iOS; arrow on Android) in a 48 target. Native stack headers render it as an item without the iOS shared glass capsule, so pushed pages match the conversation header; native title stays centred | `HeaderBackButton`; `stackBackItem`/`stackBackOptions` in `src/ui/stack-back.ts`; root `app/_layout.tsx` |
| Page context ("which computer") | `scope={{ computer, project }}` on `Screen`/`ScreenList`: one quiet 13/17 line, each value led by its 14 role glyph (laptop, folder) and spoken as "Computer: …"; heading actions (refresh 20, add) share its row. Do not hand-build "a · b" subtitles | `ScopeLine` in `src/ui/scope-line.tsx`, `ScreenHeading` |
| List rows | 52 min (56 with a detail line), 10 vertical padding, 15/21 medium label, 13/17 muted detail, inset hairline separator in a group. Leading content sits in a 32 slot so labels align across glyphs, provider marks and avatars | `NavigationRow`, `ValueRow`, `SegmentedRow`, `ToggleField`, `SelectField` row; `uiStyles.rowLeading` |
| Leading icons | 20 muted Lucide glyph, 1.8 stroke, no tile or fill; danger rows tint it. Provider marks 20 | `RowIcon` (`SettingIcon` is an alias) in `src/ui/navigation-row.tsx` |
| Status | The normal/healthy state is quiet muted text (`StatusText` default tone, no dot) or nothing. Running/info/warning/danger use `StatusText` with its tone colour and 6 dot. A tinted `Badge` is only for an exception the user must act on or notice in a list (failed, unavailable, needs you, draft) | `StatusText`, `Badge` in `src/ui/feedback.tsx` |
| Section empty state | `StateView size="compact"`: neutral is the row's body text, muted and regular, no glyph or art, aligned with the rows; a toned one leads with its 16 status glyph and a 15/21 medium title. Optional compact action below. Region art stays for a whole empty screen | `StateView` in `src/ui/state-view.tsx`, `Empty` |
| Card vs flat | Lists are flat rows in `NavigationGroup`; `Card variant="surface"` only for an independent task region (meters, a review) | `NavigationGroup`, `Card` |
| Readings / metrics | One row per reading: label left, muted tabular value right; a share of a capacity adds a small bar under the same row (accent, amber from 80%, red from 90%); sizes and counts get no bar; unknown readings are omitted, not "–" | `ValueRow` (`children` slot) in `src/ui/setting-rows.tsx`; PanelUI `Meter` |
| Menus | Never a one-item menu: `ActionMenu` renders a lone action directly (icon button if it has an icon, else a quiet text button); a lone destructive action keeps the menu unless flagged `reviewed` (it opens its own confirmation). A boolean is a `ToggleField` row, not a menu item | `ActionMenu` in `src/ui/overflow-menu.tsx`, `singleMenuAction` |

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
