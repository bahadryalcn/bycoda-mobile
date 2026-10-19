import { createRequire } from "node:module";
import { writeFile, readFile } from "node:fs/promises";
import { themePalettes, semanticPalettes, space, radii, fontSize, metrics } from "../src/ui/tokens.ts";

const require = createRequire(import.meta.url);
const requireUniwind = createRequire(require.resolve("uniwind/package.json"));
const { converter, formatCss } = requireUniwind("culori");
const toOklch = converter("oklch");
function paletteFor(mode) {
const colors = themePalettes[mode];
const semanticColors = semanticPalettes[mode];
const palette = {
  background: colors.background,
  foreground: colors.text,
  card: colors.panel,
  "card-foreground": colors.text,
  popover: colors.elevated,
  "popover-foreground": colors.text,
  primary: colors.accentSolid,
  "primary-foreground": colors.primaryText,
  secondary: colors.raised,
  "secondary-foreground": colors.text,
  muted: colors.selected,
  "muted-foreground": colors.muted,
  accent: colors.selected,
  "accent-foreground": colors.text,
  destructive: colors.danger,
  "destructive-foreground": colors.danger,
  "destructive-solid-foreground": colors.primaryText,
  border: colors.border,
  input: colors.border,
  ring: colors.info,
  panel: colors.panel,
  raised: colors.raised,
  separator: colors.separator,
  subtle: colors.subtle,
  tertiary: colors.tertiary,
  fill: colors.fill,
  elevated: colors.elevated,
  ink: colors.text,
  live: colors.live,
  "user-message": colors.userMessage,
  scrim: colors.scrim,
  overlay: colors.raised,
  "overlay-foreground": colors.text,
  "surface-1": colors.panel,
  "surface-2": colors.raised,
  "surface-3": colors.selected,
  "surface-4": colors.border,
  surface: colors.panel,
  "surface-secondary": colors.raised,
  "surface-tertiary": colors.selected,
  skeleton: colors.raised,
  inset: colors.background,
  "primary-soft": semanticColors.info.surface,
  "primary-soft-foreground": colors.accent,
  "success-foreground": colors.success,
  "warning-foreground": colors.warning,
  "info-foreground": colors.info,
  "success-solid-foreground": colors.primaryText,
  "warning-solid-foreground": colors.primaryText,
  "info-solid-foreground": colors.primaryText,
  "destructive-soft": semanticColors.danger.surface,
  "success-soft": semanticColors.success.surface,
  "warning-soft": semanticColors.warning.surface,
  "info-soft": semanticColors.info.surface,
  "info-subtle": semanticColors.info.surface,
  "success-subtle": semanticColors.success.surface,
  "warning-subtle": semanticColors.warning.surface,
  "destructive-subtle": semanticColors.danger.surface,
  "code-keyword": colors.accent,
  "code-string": colors.success,
  "code-number": colors.warning,
  "code-comment": colors.muted,
  "code-function": colors.info,
  "code-property": colors.text,
  "code-punctuation": colors.muted,
  "code-inserted": colors.success,
  "code-deleted": colors.danger,
  "chart-1": colors.info,
  "chart-2": colors.success,
  "chart-3": colors.warning,
  "chart-4": colors.danger,
  "chart-5": colors.subtle,
};
for (const [name, tone] of Object.entries(semanticColors)) {
  palette[name] = tone.text;
  palette[`${name}-surface`] = tone.surface;
  palette[`${name}-border`] = tone.border;
}
return palette;
}
const cssColor = (color) => formatCss(toOklch(color));
const declarations = Object.entries(paletteFor("dark")).map(
  ([name, color]) => `  --color-${name}: ${cssColor(color)};`,
);
for (const [name, value] of Object.entries(space))
  declarations.push(`  --spacing-ui-${name}: ${value}px;`);
for (const [name, value] of Object.entries(radii))
  declarations.push(`  --radius-${name}: ${value}px;`);
declarations.push(
  `  --radius-sm: ${radii.badge}px;`,
  `  --radius-md: ${radii.control}px;`,
  `  --radius-lg: ${radii.card}px;`,
  `  --radius-xl: ${radii.preview}px;`,
  `  --radius-2xl: ${radii.sheet}px;`,
  `  --spacing-control: ${metrics.controlHeight}px;`,
  `  --spacing-touch: ${metrics.touchTarget}px;`,
  "  --font-sans: system-ui;",
  "  --font-mono: ui-monospace;",
  `  --text-xs: ${fontSize.caption}px;`,
  "  --text-xs--line-height: 16px;",
  `  --text-sm: ${fontSize.control}px;`,
  "  --text-sm--line-height: 20px;",
  `  --text-base: ${fontSize.body}px;`,
  "  --text-base--line-height: 22px;",
  `  --text-lg: ${fontSize.title}px;`,
  "  --text-lg--line-height: 24px;",
  `  --text-xl: ${fontSize.heading}px;`,
  "  --text-xl--line-height: 28px;",
  `  --text-2xl: ${fontSize.hero}px;`,
  "  --text-2xl--line-height: 34px;",
);
for (const [name, value] of Object.entries(fontSize))
  declarations.push(`  --text-ui-${name}: ${value}px;`);

const shape = { xs: radii.badge, sm: radii.badge, md: radii.control, lg: radii.card, xl: radii.preview, "2xl": radii.sheet, "3xl": radii.sheet };
const variants = ["light", "dark"].map((mode) => `  @variant ${mode} {\n${Object.entries(paletteFor(mode)).map(([name, value]) => `    --color-${name}: ${cssColor(value)};`).join("\n")}\n${Object.entries(shape).map(([name, value]) => `    --radius-${name}: ${value}px;`).join("\n")}\n  }`).join("\n");
const css = `/* Generated by scripts/build-ui-theme.mjs from ui/tokens.ts. */\n@import "tailwindcss";\n@import "uniwind";\n@import "panelui-native/theme.css";\n@source "./";\n@source "../app";\n@source "../node_modules/panelui-native/src";\n\n@theme {\n${declarations.join("\n")}\n}\n\n@layer theme {\n  :root {\n${variants}\n  }\n}\n`;
const target = new URL("../src/global.css", import.meta.url);
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== css)
    throw new Error("Shared CSS theme is stale. Run pnpm theme:build.");
  console.log("Shared native and UniWind theme tokens match.");
} else {
  await writeFile(target, css);
  console.log("Shared UniWind theme generated from native tokens.");
}
