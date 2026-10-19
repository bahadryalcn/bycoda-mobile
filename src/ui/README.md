# bycoda mobile UI

See the [mobile design system](../../docs/reference/design-system.md) and
[coding standards](../../docs/reference/coding-standards.md) for product rules.
This README owns library integration details; the design guide owns screen and
interaction rules.

Use the [UX quality contract](../../docs/reference/ux-quality.md) for layout and
acceptance, and the [component adoption map](../../docs/reference/component-adoption.md)
to select additional library structures. Catalog availability alone is not
evidence that a screen is usable or a migration is complete.

The native application uses **PanelUI Native 0.112.0**, Expo SDK 57, Uniwind 1.12,
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

The full upstream public API is exposed as `ui/panelui` and as the `PanelUI`
namespace in `ui/library`. `catalog.ts` indexes all **140 installed component
modules**, their roles, core bycoda use cases and optional capabilities.
`catalog.test.ts` checks the inventory against the installed package. Shared UI
implementations should import individual `panelui-native/components/...` modules
when possible. Full catalog availability does not mean every component is shown
in every product screen.

`vendor/patches/panelui-native@0.112.0.patch` exposes the existing public portal
primitive without importing the full 140-component barrel in the provider. It
also declares controlled `aria-selected` on both tab trigger variants,
`aria-checked`/`aria-disabled` on Switch, Checkbox and RadioGroup items, and
`aria-valuemin`/`aria-valuemax`/`aria-valuenow`/`aria-valuetext` on both Slider
thumbs and Progress. Progress also declares `aria-busy` and clears its numeric
range and value text while indeterminate. React Native Web 0.21 does not reflect
the native composite state/value props on initial render. Native state/value props remain present, with radio
selection represented by its correct `checked` state. The narrow pinned patch
updates both source and compiled entry
and keeps one upstream portal context. Remove each patch part when upstream
exposes the portal subpath or declares the corresponding web state. The
upstream MIT license is retained alongside the patch.

The previous gluestack source remains under `ui/gluestack` as compatibility
source. Its retained license belongs to that source, and its namespaces in
`library.ts` are compatibility exports. Production screens and their shared
provider do not import this runtime. The offline tour lazy-loads ComponentGallery
only after the user selects Controls. Its interactive forms, attachments, chat,
plan, table and timeline examples use focused PanelUI imports and the same product
adapters. The searchable 140-module catalog provides category/priority filters,
explicit preview coverage, individual import paths and upstream documentation.
Optional native or service requirements remain visible; the tour does not connect
to a host, configure a service or send messages. Do not import the full upstream
barrel to render the gallery or add it to normal workspace startup.

## Record and collection controls

Focused facades also cover expandable records (`record-card.tsx`, backed by
PanelUI Accordion), connected plan steps (`plan-steps.tsx`), draft-and-apply
collection filters (`filter-sheet.tsx`), host-local wall-time selection
(`time-field.tsx`, with searchable hour/minute choices inside the product Sheet),
and a field with its adjacent action (`action-field.tsx`). Record bodies mount
on first expansion and remain mounted on collapse. Critical feedback and
frequent actions stay outside the collapsed body. These components reuse the
existing theme, overlay, access and state owners. The lazy Data gallery includes
interactive examples without host access.

## Light, dark and system appearance

`tokens.ts` owns the light/dark native palettes, semantic states, typography,
spacing, shape and motion. `scripts/build-ui-theme.mjs` generates `src/global.css`
from those tokens, imports the upstream PanelUI theme, and overrides its semantic
roles in both modes. `pnpm theme:build` regenerates CSS; `pnpm theme:check` verifies
it. Do not edit the generated CSS.

`MobileThemeController` applies the persisted system/light/dark preference before
the private workspace is available, including on the initial lock screen.
`useMobileTheme()` subscribes renderers using native inline colors. Use
`createThemedStyles(() => ({ ... }))` for reusable native style sets: it caches
styles per mode and resolves the current palette when read. Do not capture color
values in module-level objects or `StyleSheet.create`. A theme change updates
existing screens without remounting them or clearing drafts and form state.

The dark theme uses black/graphite; the light theme uses neutral white surfaces.
Both share the same blue action role and semantic status roles. Controls retain
48dp touch targets, dynamic text and the system reduced-motion preference.
Contrast tests cover text, metadata, actions and feedback in both palettes.

## Providers and private overlays

The application already owns one gesture root, keyboard provider, safe-area
provider, query cache and private overlay registry. `BycodaUIProvider` composes
PanelUI's exported PortalProvider, PortalHost and ToastViewport with those
existing owners, avoiding duplicate native managers. Its portal host disappears
immediately on lock while the mounted workspace preserves drafts.

Use the application Sheet facade for product forms, selection, confirmation and
session details. It owns dirty-form guards, back handling, focus restoration and
security visibility. A library component never grants permission to send,
approve, upload or publish. Native map rendering requires the optional MapLibre
integration and a compatible development build. PanelUI Support/Feedback need an
explicit service setup; installing the library does not configure them.

Type checks, catalog/theme tests and web export validate source integration.
Keyboard, gestures, text scaling, reduced motion, lock transitions and both
appearances still require simulator/physical-device acceptance.
