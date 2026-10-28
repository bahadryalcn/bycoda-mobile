# Native provider artwork

These SVGs are derived from the product artwork in `../../../src/assets/providers/`.
Paths, shapes, transforms, view boxes, gradients and clipping geometry are unchanged.

Android's native SVG decoder does not resolve the originals' CSS `currentColor`
or OKLCH gradient stops. Monochrome copies use explicit black paint, then
`ProviderIcon` applies the current semantic text color through native image tint.
OMP retains its colored gradient, with its original OKLCH stops converted to
sRGB (`#f84fcc`, `#9362f4`, `#00dbe4`). Intrinsic dimensions match each view box.

Web continues to use the original SVGs. When replacing provider artwork, update
these compatibility copies from the same originals and verify geometry and native rendering.
