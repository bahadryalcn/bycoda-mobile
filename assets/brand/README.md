# Native mobile brand assets

These are exact byte copies of the existing bycoda native icon assets, made on 2026-10-28 for self-contained mobile checkout/build inputs. No artwork, crop, scale, color or format was changed.

| Canonical mobile file            | Original local source under the parent checkout      | SHA-256                                                            |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `mobile-icon.png`                | `public/brand/bycoda/mobile-icon.png`                | `3b08f3007aff55bdf2fba63f45d7cb32b58b9b6e5bec51a5506437e3bf361f3f` |
| `mobile-adaptive-foreground.png` | `public/brand/bycoda/mobile-adaptive-foreground.png` | `7066af678d44ce774724aa7da38685eb0407804ca96efe14aa5f3959496c7d3d` |

`app.json` now points directly at these maintained mobile files for the app icon, adaptive foreground and monochrome icon. The originals were excluded only by the parent machine's local `.git/info/exclude`, so a remote parent checkout could not provide them. Originals and exclude rules remain untouched. These mobile paths are the canonical inputs; preview staging copies them as ordinary mobile source rather than creating a second authority or transforming them. Parent shared splash/favicon assets and source contracts remain explicit separate preview inputs.
