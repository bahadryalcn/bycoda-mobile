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
| One/many values and search | `select`, `search-bar`, `tag-input` | `src/ui/select-field.tsx`, `src/ui/search-field.tsx`; preserve single/multiple/free-entry contracts |
| Fields and numeric values | `input`, `input-group`, `number-input` | `src/ui/fields.tsx`; retain labels, refs, keyboard, validation and pending state |
| Advanced details/history | `accordion`, `timeline` | Existing `Disclosure` or focused shared composite; do not collapse required errors/state |
| Long editors and confirmation | `bottom-sheet`, `dialog` | `src/ui/dialogs.tsx`; preserve private overlay, dirty guard, Back, focus and keyboard owners |
| Loading, empty and feedback | `skeleton`, `empty-state`, `alert` | `src/ui/query-state.tsx`, `src/ui/feedback.tsx`; use semantic states and useful recovery |
| Message composer and transcript | `ai-input`, `message`, `message-scroller` | `src/ui/chat.tsx` plus workspace owners; preserve virtualized list, streaming, drafts, queue and measured composer |
| Attachments and code | `attachment`, `code-block` | Chat/file preview facades; keep transfer ownership, cancel/error and readable wide-content handling |
| Execution plan | `plan`, `planner`, `timeline` | Existing structured transcript/plan presentation; real progress and expandable details |
| Dense structured data | `table` | Focused shared data presentation; use readable summaries/detail on narrow screens, preserve all fields/actions |
| Pairing | `qr-code` | Existing connection flow; no QR credential/expiry/security contract changes |
| Contextual help | `tooltip`, `accordion` | Shared disclosure/help; touch and screen-reader access, never hover-only explanation |
| Appearance | `theme-selector` | Existing appearance setting and controller; preserve system mode and mounted drafts |

## Integration boundaries

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
