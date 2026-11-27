import { DEFAULT_PALETTE, PALETTES, derivePaletteColors, deriveInfoTone, diffColors, statusInk, statusTone, withDesktopStatus, type PaletteId } from "./palettes.ts";

export const darkColors = {
  // Three-step layering (background < panel < raised) with hairline borders.
  background: "#0B0B0C",
  panel: "#131316",
  raised: "#1A1A1E",
  border: "#2A2A30",
  separator: "#1F1F23",
  text: "#F5F5F7",
  muted: "#A0A0A8",
  subtle: "#A0A0A8",
  /** Decorative glyphs only (chevrons, grabbers); never body text. */
  tertiary: "#6C6C74",
  /** Inputs and quiet controls. */
  fill: "#16161A",
  /** Menus and floating pills. */
  elevated: "#1F1F24",
  accent: "#64B0FF",
  accentSolid: "#0071E3",
  primaryText: "#FFFFFF",
  /** Ink on solid status fills (desktop `--ui-tone-status-on-solid`): black on the bright dark-mode hues, white on light. */
  statusOnSolid: "#000000",
  info: "#64B0FF",
  live: "#64B0FF",
  /** Desktop status hues (palettes.ts STATUS_HUES) with the desktop ink mix; classic canvas lightness is 5. */
  success: statusInk("dark", "success", "#F5F5F7", 5),
  danger: statusInk("dark", "danger", "#F5F5F7", 5),
  warning: statusInk("dark", "warning", "#F5F5F7", 5),
  brand: "#F5F5F7",
  /** The guide's amber prayer beads: brand art and the unlock ring only, never text or status. */
  beads: "#F0A92E",
  selected: "#16273B",
  userMessage: "#1A1A1E",
  scrim: "#00000099",
  /** Translucent tint over the blurred floating tab bar; keeps labels readable. */
  glass: "#1F1F24F5",
  /** Full-screen media viewer: always a black stage with light controls, in both themes. */
  viewer: "#000000",
  viewerText: "#FFFFFF",
  /** Filled circle behind a viewer control (Close) on the black stage. */
  viewerControl: "#FFFFFF29",
  /**
   * Voice call stage light: soft glows behind the call orb, one pair per call state (listening,
   * thinking, speaking). Decorative only, never text, borders or status.
   */
  voiceListen: "#2F7BFF",
  voiceListenGlow: "#3FD0FF",
  voiceThink: "#8B5CF6",
  voiceThinkGlow: "#E14FD8",
  voiceSpeak: "#14C8B4",
  voiceSpeakGlow: "#5EEA9A",
  /**
   * Diff rows mirror desktop `--color-diff-*`: `diffAdd`/`diffDel` markers, `*Bg` row tint (15%), `*Gutter`
   * (25%), `*Text` readable ink; always pair with a +/- glyph. `merged`/`mergedSurface` are the purple
   * "merged" tone (desktop `feature`).
   */
  ...diffColors("dark", "#131316"),
};

export type MobileThemeMode = "light" | "dark";
export type MobileColors = typeof darkColors;
export const lightColors: MobileColors = {
  background: "#FCFCFD",
  panel: "#FFFFFF",
  raised: "#F4F4F6",
  border: "#DEDEE3",
  separator: "#ECECEF",
  text: "#17171A",
  muted: "#62626B",
  subtle: "#62626B",
  tertiary: "#8A8A93",
  fill: "#F4F4F6",
  elevated: "#FFFFFF",
  accent: "#0066CC",
  accentSolid: "#0066CC",
  primaryText: "#FFFFFF",
  statusOnSolid: "#FFFFFF",
  info: "#0066CC",
  live: "#0066CC",
  success: statusInk("light", "success", "#17171A", 5),
  danger: statusInk("light", "danger", "#17171A", 5),
  warning: statusInk("light", "warning", "#17171A", 5),
  brand: "#17171A",
  beads: "#C47F12",
  selected: "#E6EFFA",
  userMessage: "#EFEFF2",
  scrim: "#00000059",
  glass: "#FFFFFFF5",
  viewer: "#000000",
  viewerText: "#FFFFFF",
  viewerControl: "#FFFFFF29",
  voiceListen: "#3D86FF",
  voiceListenGlow: "#39C2F2",
  voiceThink: "#9468F7",
  voiceThinkGlow: "#E35BDA",
  voiceSpeak: "#18BFAD",
  voiceSpeakGlow: "#4FD98E",
  ...diffColors("light", "#FFFFFF"),
};

export const themePalettes = { light: lightColors, dark: darkColors };
export { PALETTE_IDS, PALETTES, DEFAULT_PALETTE, normalizePalette, uniwindThemeName, type PaletteId } from "./palettes.ts";
/** Bumped when the Material You swatches change; material keys then miss every cache built from old swatches. */
let materialYouGeneration = 0;
export type ThemeKey = `${PaletteId}:${MobileThemeMode}` | `${PaletteId}:${MobileThemeMode}:${number}`;
export const themeKeyOf = (palette: PaletteId, mode: MobileThemeMode): ThemeKey =>
  palette === "material" ? `${palette}:${mode}:${materialYouGeneration}` : `${palette}:${mode}`;
export const splitThemeKey = (key: ThemeKey) => key.split(":") as [PaletteId, MobileThemeMode];

let activePalette: PaletteId = DEFAULT_PALETTE;
let activeTheme: MobileThemeMode = "dark";
let activeKey: ThemeKey = themeKeyOf(activePalette, activeTheme);
const themeListeners = new Set<() => void>();
export const getMobileThemeMode = () => activeTheme;
export const getMobilePalette = () => activePalette;
/** Stable string identity of the active (palette, mode); changes only when one of them does. */
export const getMobileThemeKey = () => activeKey;
function setActive(palette: PaletteId, mode: MobileThemeMode) {
  activePalette = palette;
  activeTheme = mode;
  activeKey = themeKeyOf(palette, mode);
}
/** Run a factory with another palette and mode active (style sheets resolved for them). */
export function withMobileTheme<T>(palette: PaletteId, mode: MobileThemeMode, run: () => T): T {
  const previous = [activePalette, activeTheme] as const;
  setActive(palette, mode);
  try { return run(); } finally { setActive(previous[0], previous[1]); }
}
export const withMobileThemeMode = <T,>(mode: MobileThemeMode, run: () => T): T => withMobileTheme(activePalette, mode, run);
export const subscribeMobileTheme = (listener: () => void) => {
  themeListeners.add(listener);
  return () => { themeListeners.delete(listener); };
};
/** Called by the single application provider; renderers subscribe with useMobileTheme. */
export function applyMobileTheme(mode: MobileThemeMode, palette: PaletteId = activePalette) {
  if (mode === activeTheme && palette === activePalette) return;
  setActive(palette, mode);
  for (const listener of themeListeners) listener();
}

/**
 * Drops the cached Material You palettes and re-keys them, so the next read derives colours from the
 * current system swatches. Listeners are notified even when the active palette and mode are unchanged.
 */
export function refreshMaterialYouPalette() {
  materialYouGeneration += 1;
  for (const key of [...resolved.keys()]) if (key.startsWith("material:")) resolved.delete(key);
  activeKey = themeKeyOf(activePalette, activeTheme);
  for (const listener of themeListeners) listener();
}

const resolved = new Map<ThemeKey, { colors: MobileColors; semantic: typeof semanticPalettes.dark }>();
/** Colours and semantic tones of one palette and mode; objects are cached so identity is stable. */
export function resolveMobilePalette(palette: PaletteId, mode: MobileThemeMode) {
  const key = themeKeyOf(palette, mode);
  let entry = resolved.get(key);
  if (!entry) {
    const definition = PALETTES.find((item) => item.id === palette)!;
    entry = palette === "classic"
      ? { colors: themePalettes[mode], semantic: semanticPalettes[mode] }
      : (() => {
          const derived = derivePaletteColors(definition, mode, themePalettes[mode]);
          if (derived === themePalettes[mode]) return { colors: derived, semantic: semanticPalettes[mode] };
          const { colors, tones } = withDesktopStatus(derived, mode, definition.lightness);
          return { colors, semantic: { ...semanticPalettes[mode], ...tones, info: deriveInfoTone(colors, mode, definition) } };
        })();
    resolved.set(key, entry);
  }
  return entry;
}

/** Stable semantic accessor; never capture one of its values at module scope. */
export const colors: MobileColors = Object.defineProperties({}, Object.fromEntries(
  Object.keys(darkColors).map((key) => [key, {
    enumerable: true,
    get: () => resolveMobilePalette(activePalette, activeTheme).colors[key as keyof MobileColors],
  }]),
)) as MobileColors;

/** Native-safe equivalents of the same semantic color, tint and border. */
export const semanticPalettes = {
  dark: {
    info: { text: darkColors.info, surface: "#16273B", border: "#1F4570" },
    success: statusTone(darkColors.success, "dark", darkColors.panel, darkColors.border),
    warning: statusTone(darkColors.warning, "dark", darkColors.panel, darkColors.border),
    danger: statusTone(darkColors.danger, "dark", darkColors.panel, darkColors.border),
  },
  light: {
    info: { text: lightColors.info, surface: "#E6EFFA", border: "#B9D2F0" },
    success: statusTone(lightColors.success, "light", lightColors.panel, lightColors.border),
    warning: statusTone(lightColors.warning, "light", lightColors.panel, lightColors.border),
    danger: statusTone(lightColors.danger, "light", lightColors.panel, lightColors.border),
  },
};
export const semanticColors = Object.defineProperties({}, Object.fromEntries(
  Object.keys(semanticPalettes.dark).map((key) => [key, {
    enumerable: true,
    get: () => resolveMobilePalette(activePalette, activeTheme).semantic[key as keyof typeof semanticPalettes.dark],
  }]),
)) as typeof semanticPalettes.dark;
export type SemanticTone = keyof typeof semanticColors;

export const space = { xxs: 2, xs: 4, sm: 6, row: 10, md: 12, lg: 16, screen: 16, xl: 20, xxl: 28 };
export const radii = { badge: 6, control: 10, card: 12, bubble: 18, composer: 24, preview: 14, sheet: 24, pill: 999 };
export const motion = { press: 120, reveal: 220, sheet: 280 };
export const fontSize = {
  micro: 11,
  caption: 12,
  badge: 12,
  small: 13,
  control: 14,
  body: 15,
  input: 16,
  title: 16,
  heading: 18,
  /** Screen title in the content (`uiStyles.pageTitle`). */
  pageTitle: 22,
  hero: 24,
  display: 28,
};
/** Paired line heights; keep in step with fontSize. */
export const lineHeight = {
  micro: 14,
  caption: 16,
  badge: 16,
  small: 17,
  control: 19,
  body: 21,
  /** Chat reading text. */
  message: 22,
  input: 21,
  title: 21,
  heading: 24,
  pageTitle: 28,
  hero: 30,
  display: 34,
  /** Monospace code lines: caption size with reading leading. */
  code: 18,
};
/** Visible sizes are compact; hit areas stay touchTarget (>= 48) via hitSlop or padding. */
export const metrics = {
  controlHeight: 40,
  compactControlHeight: 32,
  inputHeight: 48,
  iconTarget: 48,
  touchTarget: 48,
  visualControl: 32,
  chipHeight: 28,
  buttonHeight: 40,
  rowHeightSession: 56,
  rowHeightProject: 52,
  /** Section label row; fits a 32 visual trailing control (info, count, action) without growing. */
  sectionHeaderHeight: 32,
  /** Leading slot of every list row: glyphs, provider marks and avatars centre in it so labels align. */
  rowLeading: 32,
  /** Guide line that joins grouped rows to their group header. */
  groupGuide: 2,
  toolRowHeight: 28,
  headerHeight: 48,
  composerFieldMin: 48,
  multilineHeight: 96,
  contentWidth: 760,
  /** Readable text column on wide panes (transcript, tablet tab roots). */
  readableWidth: 760,
  /** Detached tablet sheet card width. */
  sheetCardWidth: 600,
  entryWidth: 520,
  /** Tablet navigation rail width (icon with label below); also a labeled dock destination slot. */
  tabletRailWidth: 88,
  /** Dock capsule cap on tablets and landscape large phones. */
  wideDockWidth: 960,
};
/**
 * Icon sizes by role. One size per role on every screen: `inline` sits in a text line (scope line,
 * meta), `status` leads a status/notice line, `row` is a list row's leading glyph, `action` is a
 * header or toolbar icon button, `back` is the navigation chevron, `check` is the selected mark.
 */
export const iconSize = { inline: 14, status: 16, row: 20, action: 20, back: 24, check: 16 };

/** Widest a scope pill (computer, project) grows; long names end in an ellipsis instead of wrapping. */
export const SCOPE_PILL_MAX_WIDTH = 240;
/**
 * Vertical rhythm between groups: 28 from the previous group to the next section label's text. A
 * screen's parent gap (`space.lg` 16) + the header lead-in (`headerLeadIn` 4) + half of the 32 header
 * row around its 16 label line (8) = `group`. A header sits `headerGap` above its first row.
 */
export const rhythm = { group: space.xxl, headerLeadIn: space.xs, headerGap: space.xs };
/** Gap between a row icon and its text. */
export const gapIcon = 8;
/** Padding that grows a smaller visual control to the 48 touch target. */
export const hitSlopFor = (visual: number) => {
  const side = Math.max(0, Math.ceil((metrics.touchTarget - visual) / 2));
  return { top: side, bottom: side, left: side, right: side };
};
export const opacity = { disabled: 0.45, pressed: 0.72 };

/** Brand inks of the provider logos that keep their own colours (GitLab, Jira); never text or status. */
export const providerBrandColors = { gitlab: ["#E24329", "#FC6D26", "#FCA326"], jira: "#2684FF" } as const;
/**
 * The 16 ANSI terminal colours (black, red, green, yellow, blue, magenta, cyan, white, then their
 * bright variants) per mode, readable on `panel`/`background`. Terminal output only; 256-colour and
 * truecolor values arrive as literal RGB from the program.
 */
export const terminalAnsiPalettes = {
  dark: [
    "#4B4B53", "#EF7777", "#9BD777", "#E8C775", "#83ABED", "#D89EE9", "#8AD7DF", "#DEDEDE",
    "#888888", "#FF9898", "#B9EB98", "#F9E09E", "#A3C1FF", "#F0B7FA", "#A9EEF2", "#FFFFFF",
  ],
  light: [
    "#17171A", "#C62828", "#2E7D32", "#8D6E00", "#1E5BC6", "#8E3AA8", "#0E7C86", "#52525B",
    "#71717A", "#D32F2F", "#388E3C", "#9A7B00", "#2B6CD8", "#A347C0", "#138A94", "#17171A",
  ],
} as const satisfies Record<MobileThemeMode, readonly string[]>;
export const monoFont = process.env.EXPO_OS === "ios" ? "Menlo" : "monospace";

/** Web inputs inherit the same system face as native text; native keeps its OS default. */
export const interfaceFont = process.env.EXPO_OS === "web" ? "system-ui" : undefined;
