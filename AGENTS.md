# bycoda mobile development rules

Applies to this directory and its descendants. Read the parent repository's
`AGENTS.md` and `.artifact` as well. Desktop Arc/component paths in parent
guidance describe desktop code; mobile uses the PanelUI owners below.

## Product intent

Build an application that is immediately understandable, easy to use, simple,
modern and visually refined. Usability and reliable layout come before ornament.
The user should understand where they are, which computer/project they control,
what is happening and what to do next without reading a tutorial.

Modernization means better hierarchy, component choice, spacing and interaction;
changing colors or rounding every box is insufficient. Do not hide required
fields, errors, permissions or useful capabilities to make a screen look simpler.

## Read before UI work

Use one product language across all screens and all agents. The
[shared consistency contract](docs/reference/design-system.md#one-coherent-product-language)
is canonical: the same user intent uses the same pattern, terminology, control
family and state behavior. Adapt PanelUI to that language. Improve shared owners
and affected consumers together; do not invent a visual direction per screen.

1. [Design system](docs/reference/design-system.md).
2. [UX quality contract](docs/reference/ux-quality.md).
3. [Component adoption contract](docs/reference/component-adoption.md).
4. [Coding standards](docs/reference/coding-standards.md).
5. [UI integration details](src/ui/README.md) and the affected shared owners.

## Component selection

- The installed library is `panelui-native`, currently pinned in `package.json`.
  Check its local catalog and installed source before assuming an API exists.
- Start with the user task. Compare appropriate patterns before preserving old
  markup: navigation rows, tabs, searchable selection, disclosure, menu, sheet,
  inline editing, structured message or attachment.
- Reuse `src/ui/primitives.tsx`, `src/ui/chat.tsx` and focused shared facades.
  Extend a facade when reusable behavior is missing. New upstream presentation
  belongs behind a product facade using focused component imports.
- Do not add a second UI kit, copy desktop Arc controls, activate services or
  import the full upstream barrel to get a single component. Keep the gallery
  lazy. Available catalog entries are candidates, not a mandate to show them all.
- Keep native elements inside shared primitives/specialized composites where
  required for semantics, gestures or performance. Do not mechanically turn
  tabs, list rows, trees and drag targets into action buttons.

## Layout and visual quality

- Diagnose shared ownership before screen-specific patches: navigator chrome,
  safe areas, list viewport, Sheet body/footer, keyboard and composer measurement.
- Each region has one vertical scrolling owner. Long collections stay virtualized.
  Headers and fixed actions must reserve real layout space. Absolute overlays
  need measured clearance and an identified owner; arbitrary offsets are not fixes.
- Keep touch targets at least 48dp. Allow localized labels, large text, errors
  and metadata to grow. Never solve overflow by shrinking essential text, clipping
  controls or hiding content with `overflow: hidden`.
- Use shared semantic color, type, spacing, shape and motion tokens. Preserve
  system/light/dark appearance, reduced motion and accessible focus/labels.
- Long forms use independently scrolling content and reachable actions. Sheet
  renders its `footer` and descendant `FormActions` in the shared action area
  outside the scroller. Keep the editor's state and callbacks in its existing
  owner; do not create local sticky-action forks.
- Keep one primary action per active task; frequent actions stay discoverable.
  Secondary details use deliberate disclosure. Prefer clear labels to unexplained
  icon-only actions. Avoid repeated toolbars and decorative card nesting.

## Preserve behavior

Retain drafts, focus, selection, scroll, machine/project identity, conflict guards,
host capabilities and owner approvals. Theme/visual changes must not remount a
workspace or authorize sends, deletion, merges or publishing. Keep host operations
behind existing access-aware transport/state owners and credentials in SecureStore.

## Delivery and checks

For a redesign: inspect current behavior → record/reproduce defects → choose
components → repair shared layout → migrate the full affected screen family →
verify. Keep confirmed observations separate from hypotheses. A screenshot that
looks good at one size is insufficient acceptance.

Use the [UX acceptance matrix](docs/reference/ux-quality.md#acceptance-matrix).
Run focused checks appropriate to changed code, then inspect the real rendered
screens. `pnpm typecheck` includes theme/UI/runtime/locale checks. Do not repeat
them after success without a relevant change. Documentation-only work requires
link/path/contract checks, not a full application build.

Report files, actual checks and remaining device/host blockers. Never claim all
screens are fixed from one demo or claim native acceptance from web preview.

On Windows use `exec_command` with `tty=true`; poll with `write_stdin` and keep
background helpers hidden. Preserve others' dirty work. Stay on the current
branch; no staging, commits, push, installation or publication without authority.
Use one agent unless delegation is explicitly requested. Task plans and evidence
belong under ignored `temp/local/` and `temp/verification/`; maintained rules
belong in `docs/reference/`. Write maintained documentation in English.
