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
retain 48dp targets even when their visible glyphs are small. Do not copy desktop
pixel sizes, CSS, Arc runtime or overlay infrastructure.

Avoid nested decorative cards, repeated introductions, permanent help paragraphs
and competing primary buttons. Keep labels, validation, approval requirements,
connection state and recovery visible. Optional help uses `Disclosure`; less
frequent commands use `ActionMenu`.

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
component subpaths. Retained gluestack source is compatibility material. Do not
eagerly import the full upstream barrel or component gallery into startup.

## Color and appearance

Use `colors`, `semanticColors` or generated semantic utilities. Add a missing
role in `tokens.ts` for both palettes, regenerate CSS and check contrast.
Do not invent feature-local hex colors, tints or gradients.

| Role | Use |
| --- | --- |
| `background` | Application canvas |
| `panel`, `raised` | Grouped content and raised surfaces |
| `fill`, `elevated` | Control/search fills and floating or selected control surfaces |
| `text` | Primary content |
| `muted`, `subtle` | Supporting readable text |
| `tertiary` | Decorative glyphs such as chevrons; never body text |
| `border`, `separator` | Boundaries and row separation |
| `accent` | Interactive foreground and action glyphs |
| `accentSolid`, `primaryText` | Filled primary control and label |
| `selected` | Selected content surface |
| `info`, `success`, `warning`, `danger` | Actual semantic feedback |
| `semanticColors[tone]` | Matching status text, surface and border |
| `userMessage`, `scrim` | Conversation bubble and modal backdrop |

Dark uses black and graphite; light uses neutral grouped surfaces. Keep
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
| Spacing | `xxs` 3; `xs` 4; `sm` 8; `row`/`md` 12; `lg`/`screen` 16; `xl` 24; `xxl` 32 |
| Type | `micro` 11; `caption`/`badge` 12; `small` 13; `control`/`body` 16; `input`/`title` 17; `heading` 20; `hero` 28; `display` 34 |
| Radius | `badge` 6; `control` 12; `card` 20; `preview` 22; `sheet` 32; `pill` 999 |
| Targets | Controls, inputs, selections and icon targets 48; multiline minimum 96 |
| Width | Content 760; entry surfaces 520 |
| Motion | Press 120ms; reveal 220ms; sheet 280ms |

Use `Body`, `Heading`, `CodeText` and shared `uiStyles`. Keep the system text face
and shared monospace role. Avoid fixed text heights and truncation hiding
essential values. Wrap long localized labels or move secondary metadata to a
second row. Compact density reduces padding, not target height.

Role radius does not imply every component uses that shape: shared buttons use
a pill through `controlClasses`. Presentation belongs in the shared owner.

## Choose components by task

| Task | Product component | Rule |
| --- | --- | --- |
| Command | `Button` | Use `label`, `tone`, `busy`, `disabled` |
| Icon command | `IconButton` | Supply an accessible localized `label` |
| Actionable card | `PressableCard` | Preserve selection/expansion semantics |
| Text editing | `Input`, `Field`, `IdentifierField` | Visible labels, suitable keyboard, inline errors |
| Boolean setting | `ToggleField` | Explain consequences when needed |
| Short peer view/value | `SegmentedControl`, `ChoiceChip` | Explicit selected state |
| One/many options | `SelectField`, `MultiSelectField` | Enable search for long or growing lists |
| Settings navigation | `NavigationGroup`, `NavigationRow` | Group related destinations and values |
| Collection | `ScreenList`, `SearchField` | Stable rows, query state and refresh |
| Editor/confirmation | `Sheet`, `FormActions`, `ConfirmationCard` | Guard dismissal and show async feedback |
| Feedback | `QueryState`, `MutationState`, `Notice`, `ErrorNotice`, `Badge` | Actual state and useful recovery |
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

## Acceptance

Review narrow/wide layouts, long content, supported languages, both themes,
dynamic text and reduced motion. Exercise relevant loading, empty, offline,
failure, retry and pending states. Shared-control changes need representative
existing consumers as well as the new use case.

Source checks and browser previews support implementation review. Native
keyboard, gestures, OS Back, screen readers, lock transitions and physical-device
behavior require native acceptance. The offline tour grants no host access and
does not authorize sends or publication.
