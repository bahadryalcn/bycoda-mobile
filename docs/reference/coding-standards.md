# bycoda mobile coding standards

These rules apply to `mobile/`. Read repository `AGENTS.md` and `.artifact`, then
the [design system](design-system.md) for UI work. Existing product contracts
take precedence over generic library examples. This is the expected direction,
not a certification that every existing file follows every rule.

Also follow local [AGENTS.md](../../AGENTS.md), the
[UX quality contract](ux-quality.md) and
[PanelUI adoption contract](component-adoption.md). Diagnose shared layout
ownership before adding per-screen offsets or duplicated controls.

## Architecture and ownership

| Location | Responsibility |
| --- | --- |
| `app/` | Expo Router route entries and navigator layouts |
| `src/features/<feature>/` | Screens, editors, models and adjacent tests |
| `src/ui/` | Product controls, theme, layout, overlays and presentation |
| `src/state/` | Machine selection, access-aware host operations and app state |
| `src/remote/` | Host transport and remote communication |
| `src/domain/` | Domain types and query identity helpers |
| `src/app-providers.tsx`, `src/app-lifecycle.tsx` | Providers and lifecycle |
| `scripts/` | Maintained package checks and generation |
| `docs/guides/`, `docs/reference/` | Maintained user and engineering guidance |

Keep route entries thin. Put business decisions in models/hooks rather than
navigators. Extract components around identifiable interactions. Share abstractions
for real common requirements; keep feature-specific logic out of shared UI.

The mobile app controls an existing host. It does not run desktop agents or
operate on a local project checkout. Desktop types may use type-only imports;
runtime sharing uses approved pure contracts. `scripts/check-runtime.mjs` owns
that allowlist. Do not import desktop workbench/Tauri runtime into native paths.

## TypeScript and file conventions

- Keep strict TypeScript. Use domain types and discriminated unions for mutually
  exclusive states; avoid `any` and loose boolean combinations at boundaries.
- Treat external input and caught errors as untrusted. Validate/narrow before
  use; type assertions do not validate RPC responses.
- Use `import type` for type dependencies. Prefer `@/` across features and
  relative imports for focused siblings, consistent with nearby code.
- Use kebab-case filenames, PascalCase components/types, camelCase functions
  and `useSomething` hooks. Preserve Expo Router's required filenames.
- Keep meaningful tests adjacent as `*.test.ts`/`*.test.tsx`. Keep imports at the
  top and follow neighboring formatting without unrelated reformatting.
- Comments explain contracts and non-obvious constraints. Remove commented-out
  implementations; do not narrate obvious JSX.

Do not introduce a formatter/linter or new import-order scheme just to document
the project. Actual package scripts determine automated checks.

## React and state

Keep render pure. User commands belong in event handlers, not mount effects that
can replay. Effects synchronize external systems and clean up subscriptions,
timers and requests. Keep dependencies honest.

Local state owns transient editors; existing Zustand stores own shared app state;
TanStack Query through host hooks owns server state. Keep one owner per value.
Do not copy query results to another store without a concrete editing/persistence
requirement. Use reducers/state machines for multi-step editor and queue flows.

Preserve stable keys, focus, selection, scroll and drafts through refreshes,
theme changes and lock/unlock. Do not key screens by appearance or rebuild
providers to refresh content. Virtualize growing collections and use domain IDs.
Lazy-load optional galleries/renderers/tools. Add memoization when identity or
measured work needs it rather than applying it to every component.

## Remote operations and identity

Use `useHostQuery`/`useHostMutation` from `src/state/queries.ts` where they cover
the operation. They participate in machine identity, app-access and consent
checks. Specialized transfers reuse `useHostClient` and transport contracts.

Include project/session scope in keys and parameters. Preserve machine-scoped
cache keys and the mutation context captured when work starts. Responses from
one computer must not update another after a selection change. Respect abort
signals, stale-response handling and cache invalidation.

Use real advertised capabilities and host method contracts. Preserve unsupported
and update-required states for older hosts. Keep foreground/background polling
policy. Offline LAN access is why existing queries use `networkMode: "always"`.

Writes preserve validation, permissions, version/conflict guards and idempotency.
Prevent duplicate submissions in both UI and the operation model. Do not blindly
retry sends or destructive writes. Clear drafts/close editors only after the
defined successful outcome. A UI refactor must not change operation order.

## Errors and forms

Distinguish initial load, cached refresh, empty results, ordinary failure, lost
authorization and changed host identity. Use shared query/mutation presentation.
Keep cached content only when access remains valid; do not show every failure
as an empty list.

Use `unknown` for unclassified failures and shared error rendering. Make recovery
explicit. Do not swallow errors that leave work looking complete. Best-effort
cleanup needs a clear reason and must preserve its recovery mechanism.

Retain dirty guards, pending state, drafts and server conflict checks. Footer
submit acts on the current editor state. A visual change must preserve persistence
and permission semantics.

## UI, copy and platform boundaries

Follow [design-system ownership](design-system.md#ownership-and-sources-of-truth).
Feature code uses facades and tokens. Generate `src/global.css` with
`pnpm theme:build`; never edit it by hand. Keep native theme styles reactive and
the single gesture, keyboard, safe-area, query and overlay owners intact.

Use `useCopy()` and existing localization. Its call shape is
`copy(turkish, english, values?)`. Use the existing `{p1}`, `{p2}` placeholder
contract rather than translated fragment concatenation. Update relevant catalogs,
run `check:locales` and review
long translations, accessible labels, errors and statuses.

Reuse platform-specific `.native.tsx` and web/native boundaries where needed.
Use canonical resolvable Lucide Native icon subpaths. Keep browser globals out
of native runtime. Preserve upstream licenses and pinned integration patches;
editing installed `node_modules` is not a deliverable.

## Privacy and action permissions

Keep credentials in the native credential store. Pairing material, private
endpoints, access keys and conversations must not enter logs, tracked fixtures,
public share URLs or ordinary metadata stores. Preserve HTTPS, environment
identity checks, lock coverage and provider consent.

Access checks remain effective at request time, including after background,
lock, computer switch and stale callbacks. Private portals disappear on lock
without destroying drafts. Available components/capabilities do not grant service
access or permission to send, approve, merge or publish. Keep owner approval
in the action path; disabled styling alone is not authorization.

## Verification and delivery

Run commands from `mobile/` with its pinned pnpm and separate lockfile. On Windows
use headless `tty=true`; background helpers use hidden windows. Reuse dependencies
unless a package change requires installation.

| Change | Relevant verification |
| --- | --- |
| Tokens/theme | `pnpm theme:build`, `pnpm theme:check`; focused theme/contrast tests |
| UI controls | `pnpm check:ui`, `pnpm typecheck`; representative consumers and preview |
| Transport/imports | `pnpm check:runtime`; focused identity/access/transport tests |
| Copy | `pnpm check:locales` |
| Models/state | `pnpm test -- src/path/to/model.test.ts` |
| Runtime/bundling | `pnpm export:web` when web coverage is relevant |
| Store configuration | `pnpm check:release`; [store guide](mobile-store-release.md) |
| Documentation only | Verify links, paths, APIs and command names |

`pnpm typecheck` currently runs theme, UI, runtime and locale checks before
TypeScript. Do not repeat successful subchecks without a new edit/failure.
Test meaningful behavior and regressions rather than mirroring implementation.

Report delivered files, checks and blockers. Separate source, browser/offline
tour, simulator, physical-device and release acceptance; never claim unavailable
acceptance passed. Documentation alone does not need an unrelated full build.

Preserve other sessions' dirty work. Do not stage, commit, switch branches, push,
publish, install releases or clean unrelated files without authorization. Put
temporary captures/plans/logs under ignored repository `temp/` locations.
Maintained documentation is English under `.artifact`.
