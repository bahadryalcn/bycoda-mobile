import { DEFAULT_PALETTE, PALETTES, derivePaletteColors, deriveInfoTone, type PaletteId } from "./palettes.ts";

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
  info: "#64B0FF",
  live: "#64B0FF",
  success: "#32D74B",
  danger: "#FF6961",
  warning: "#FFD60A",
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
  info: "#0066CC",
  live: "#0066CC",
  success: "#187A33",
  danger: "#C4141E",
  warning: "#8F5200",
  brand: "#17171A",
  beads: "#C47F12",
  selected: "#E6EFFA",
  userMessage: "#EFEFF2",
  scrim: "#00000059",
  glass: "#FFFFFFF5",
  viewer: "#000000",
  viewerText: "#FFFFFF",
};

export const themePalettes = { light: lightColors, dark: darkColors };
export { PALETTE_IDS, PALETTES, DEFAULT_PALETTE, normalizePalette, uniwindThemeName, type PaletteId } from "./palettes.ts";
export type ThemeKey = `${PaletteId}:${MobileThemeMode}`;
export const themeKeyOf = (palette: PaletteId, mode: MobileThemeMode): ThemeKey => `${palette}:${mode}`;
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
          const colors = derivePaletteColors(definition, mode, themePalettes[mode]);
          return { colors, semantic: { ...semanticPalettes[mode], info: deriveInfoTone(colors, mode, definition) } };
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
    success: { text: darkColors.success, surface: "#0F2A16", border: "#1D5A2A" },
    warning: { text: darkColors.warning, surface: "#2E2606", border: "#5E4D0C" },
    danger: { text: darkColors.danger, surface: "#331514", border: "#6B2B28" },
  },
  light: {
    info: { text: lightColors.info, surface: "#E6EFFA", border: "#B9D2F0" },
    success: { text: lightColors.success, surface: "#E5F5E9", border: "#B4DFC0" },
    warning: { text: lightColors.warning, surface: "#FFF3DD", border: "#F0D29C" },
    danger: { text: lightColors.danger, surface: "#FDECEC", border: "#F3BDBD" },
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
  hero: 30,
  display: 34,
};
/** Visible sizes are compact; hit areas stay touchTarget (>= 48) via hitSlop or padding. */
export const metrics = {
  controlHeight: 40,
  compactControlHeight: 32,
  inputHeight: 48,
  selectionHeight: 40,
  iconTarget: 48,
  touchTarget: 48,
  visualControl: 32,
  chipHeight: 28,
  buttonHeight: 40,
  rowHeightSession: 56,
  rowHeightProject: 52,
  sectionHeaderHeight: 28,
  /** Minimum width of a count pill so one- and two-digit counts share a shape. */
  countPill: 22,
  /** Guide line that joins grouped rows to their group header. */
  groupGuide: 2,
  toolRowHeight: 28,
  headerHeight: 48,
  composerFieldMin: 48,
  multilineHeight: 96,
  contentWidth: 760,
  entryWidth: 520,
  /** Floating dock capsule height (touch target plus padding). */
  tabBarHeight: 56,
  /** Round action beside the dock, and the gap/margins around the dock. */
  dockActionSize: 56,
  dockGap: 8,
  dockMargin: 10,
};
/** Gap between a row icon and its text. */
export const gapIcon = 8;
/** Padding that grows a smaller visual control to the 48 touch target. */
export const hitSlopFor = (visual: number) => {
  const side = Math.max(0, Math.ceil((metrics.touchTarget - visual) / 2));
  return { top: side, bottom: side, left: side, right: side };
};
export const opacity = { disabled: 0.45, pressed: 0.72 };
export const monoFont = process.env.EXPO_OS === "ios" ? "Menlo" : "monospace";

/** Web inputs inherit the same system face as native text; native keeps its OS default. */
export const interfaceFont = process.env.EXPO_OS === "web" ? "system-ui" : undefined;
