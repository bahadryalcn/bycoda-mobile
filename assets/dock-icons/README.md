# Dock navigation glyphs

Owner-selected B, **Duotone depth**, for bycoda mobile:

- Projects: two offset repository slabs.
- Sessions: opaque prompt bubble with translucent rear bubble.
- Inbox: opaque receiving tray with translucent descending arrow.
- Tools: opaque electrical plug with translucent rear cable.
- Settings: paired opaque/translucent tuning faders.
- New session: translucent empty chat bubble with bold opaque corner plus.
- More: three horizontal round dots; opaque center, translucent outer dots.

Each PNG has pure white RGB, opaque foreground (255 alpha), approximately
35% back-plane alpha (89), and antialiased edges. DockIcon uses React Native
Image tintColor, preserving source alpha. Active tabs use colors.text,
inactive tabs use colors.muted, and the command uses colors.primaryText on
colors.accentSolid. Dusk resolves command ink to dark background-like ink;
classic light uses white ink on blue. No runtime opacity flattening is applied.

Metro selects name.png, name@2x.png, or name@3x.png for 24dp images.
Seven names remain unchanged: 21 PNGs at 24/48/72px. B artwork retains
22dp optical extent inside the 24dp canvas; More uses 18dp.

## Provenance and processing

Built-in imagegen produced the v3 B family on 2026-11-15. The first five glyphs
use selected v3/B/*.png masters unchanged at 72px, with Lanczos-derived
24px and 48px exports. The rejected wand is replaced by a newly generated chat
bubble and plus. Three independent transparent imagegen candidates explored
corner plus, sparkle-plus, and compose pencil. Candidate 1 was selected after
inspection at actual 24px and 72px on the Dusk accent square: its explicit plus
communicates creation and its empty bubble differs from Sessions' prompt.
This is visual review, not user-testing evidence.

The existing generated More round-dot source is reused, with outer dots mapped
to 35% alpha and center dot opaque to match B. Pillow performs alpha
normalization, trimming, white RGB conversion, density export and fixture
composition. New-session source alpha below 24 is discarded; remaining alpha
maps to 89 below 170 and 255 otherwise before Lanczos scaling. This preserves
two planes rather than normalizing every shape to opaque white. No runtime
dependency or runtime code change was needed.

Reproduction records in the parent checkout's ignored local evidence:

- temp/verification/2026-11-15-icon-dock/v3/prompts.json, notes.md and
  B/source.png: original B prompts and source.
- temp/local/2026-11-15-mobile-session-ui/icon-candidates-v4.json: exact three
  new-session prompts and original generation paths.
- temp/verification/2026-11-15-icon-dock/v4/: copied raw new-session sources
  and all candidate density exports.
- temp/local/2026-11-15-mobile-session-ui/process-icons-v4.py: export,
  contact-sheet composition and asset assertions.
- temp/verification/2026-11-15-icon-dock/v4-final.png: Dusk and classic light
  dock mocks at 1x/3x with Sessions active, all three new-session candidates,
  and all seven glyphs with active/inactive tints.

These are offline asset fixtures, not native/device captures. Previous v2/v3
evidence is retained. No build or installation is part of this asset pass.
