# Mobile UX quality contract

This defines the expected product behavior for new and redesigned screens. It
is a target and acceptance contract, not a claim that all current screens pass.
Read with the [design system](design-system.md),
[component adoption contract](component-adoption.md) and
[coding standards](coding-standards.md).

## The product test

A first-time user can identify the current location, active computer/project,
main content, operation state and next useful action without a permanent help
paragraph. Frequent work needs a short, predictable path. Advanced capability
remains available through clearly named secondary navigation or disclosure.

Judge polish by legibility, alignment, consistency, predictable interaction and
complete states. New fonts, gradients, glass, elaborate motion and many cards
are not substitutes for usability. Preserve the established system typography,
semantic palette and Lucide icons unless a separately justified shared change
improves the product. Generic redesign examples do not override these decisions.

## Information hierarchy

- One page identity and a compact context indicator. Do not repeat native and
  custom headings or put the same computer/project explanation in every section.
- One primary action for the current task. Use labels that describe the outcome,
  such as Save note or Connect computer. Secondary actions carry less weight.
- Make navigation look like navigation, editable values look editable and commands
  look actionable. A long row of identical pills cannot express every relationship.
- Show the essential summary first. Put detailed history, configuration and logs
  behind navigation/disclosure while keeping state and recovery visible.
- Search growing collections. Put secondary filters in an accessible selection
  surface, show applied state on the trigger and provide reset. Preserve drafts
  until apply succeeds when the interaction uses explicit application.
- Do not reduce noise by removing meaningful data or actions. Reorganize them.

## Layout ownership

| Region | Owner to inspect | Required behavior |
| --- | --- | --- |
| Top title and safe area | `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `src/ui/layout.tsx` | One title/inset owner; long context never pushes actions off-screen |
| Bottom navigation | `src/ui/floating-tab-bar.tsx` | Labels/targets fit; last content remains reachable; keyboard changes do not create a jump or dead strip |
| Screen/list viewport | `src/ui/layout.tsx`, `src/ui/screen-list.tsx` | One vertical scroller, bounded content, stable refresh/selection |
| Sheet and actions | `src/ui/dialogs.tsx`, `src/ui/sheet-guard.ts` | Header, body, action area and safe area have explicit owners; errors and dismissal remain usable |
| Conversation/composer | `src/features/workspace/session-keyboard-frame.tsx`, `session-composer.tsx` in the same directory | Composer footprint reserved exactly once; final message and editing controls stay reachable |
| Private overlays | `src/ui/overlays.tsx`, `src/ui/provider.tsx` | Correct stacking/Back/focus and immediate privacy coverage on lock |

Sheet renders its explicit footer and descendant `FormActions` outside the body
scroller. Editors retain draft state, guards and callbacks; a Sheet-local action
slot presents the current actions without copying the editor state. Outside a
Sheet, `FormActions` stays inline. Native keyboard acceptance remains separate
from this source contract. An absolute composer is not automatically a defect:
reproduce its clearance and keyboard behavior before replacing it.

Do not patch overlaps with arbitrary bottom padding, negative margins, higher
z-index or feature-specific copies of the shell. First identify which owner
counts the inset, keyboard and fixed content. Use normal flow or measured
clearance. Keep growing text, variable errors and expanded content in the budget.

## Interaction and state

Every applicable surface handles initial load, empty content, cached refresh,
offline/reconnect, denied access, unsupported capability, error/retry, pending
write and completion. Keep the previous useful content on ordinary refresh
failure when access remains valid; remove private data when access is lost.

Forms retain values on error. Field errors stay near their inputs; operation
errors stay near the action. Long forms target a scrolling body with persistent
actions above the keyboard; short confirmations can stay compact. Guard dirty
dismissal and pending submission. Preserve return focus and native Back.

Selection and status use semantics and text as well as color. Touch targets are
48dp or larger. Essential actions remain operable with large text and assistive
technology. Horizontal scroll is limited to genuinely wide content such as code,
diffs or tables, not an entire page or an ordinary form.

## Acceptance matrix

Consistency is an explicit acceptance requirement. Compare each changed screen
with another consumer of the same collection, detail, editor or settings pattern.
Check terminology, action order, icon meaning, type/spacing, selection, errors,
loading, dismissal and recovery. Record unexplained differences as defects.
Evaluate the family together; individually attractive screens can still fail
the [shared product language](design-system.md#one-coherent-product-language).

For each changed screen family, record pass/fail/blocked/not-applicable with the
scenario, viewport/device, appearance, steps and evidence. N/A needs a reason.
Choose representative shared consumers and cover every migrated route before
declaring the family complete. Do not fabricate a connected state to bypass
security or approval.

| Dimension | Minimum review |
| --- | --- |
| Width | 320, 360, 390 and 430 logical units; 768 tablet; wide browser preview |
| Height/orientation | Short viewport, portrait, landscape and rotation during editing |
| Appearance | Light, dark and a system appearance change while a draft is open |
| Text | Default and approximately 200% system text; longest supported labels and long IDs/paths |
| Keyboard | Open/close on first/last fields; multiline composer growth; error appearing while keyboard is open |
| Content | Empty, typical, long collection, expanded detail, attachments and multiline errors |
| Async | Loading, refresh, failure/retry, offline/reconnect and duplicate tap prevention |
| Navigation | Tab/route change, return, scroll restoration and dirty dismissal |
| Accessibility | Named controls, selected state, reading order, visible web focus, native screen reader and reduced motion |
| Private state | Lock/background, unlock, machine/project switch with pending work and retained drafts |

Required observable outcomes:

1. No unintended overlap between content, chrome, keyboard, sheets and actions.
2. No inaccessible final row, submit button or required field.
3. No clipped essential label, off-screen control or whole-page horizontal drift.
4. No duplicate title/inset or unexplained large empty strip after transitions.
5. No draft/focus/selection loss from a theme change or cosmetic rerender.
6. Coherent typography, spacing and states across all migrated consumers.

Use browser resizing and offline tour/fixtures for layout iteration. Native
keyboard, insets, gestures, Back, text scaling and lock need simulator/device
checks. Connected workflows need a permitted host. A blocked native check remains
blocked even if source checks and browser screenshots pass.
