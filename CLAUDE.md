# bycoda mobile

Read and follow [AGENTS.md](AGENTS.md). It is the canonical local instruction
file for product intent, PanelUI adoption, layout quality, implementation
boundaries and verification. Do not maintain a competing copy of those rules.

Use the same [product language](docs/reference/design-system.md#one-coherent-product-language)
as every other contributor. Choose shared patterns by user intent and apply
changes through their common owners and consumers. Do not create Claude-specific
or screen-specific design conventions.

Before UI work, read the design system, UX quality contract, component adoption
contract and coding standards linked there. The goal is an understandable,
simple, easy-to-use, modern and refined application. Preserve functionality and
fix shared layout causes before visual polish.

The dependency is `panelui-native`; screens use bycoda's shared facades. Check
actual component APIs and distinguish implemented behavior from migration targets.
Keep work uncommitted and preserve other sessions' changes. Temporary plans and
evidence stay in ignored `temp/`; native acceptance must be reported separately.
