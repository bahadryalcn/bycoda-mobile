export const darkColors = {
  // Apple system dark: true black canvas, elevated grouped surfaces and one accessible blue.
  background: "#000000",
  panel: "#1C1C1E",
  raised: "#2C2C2E",
  border: "#3A3A3C",
  separator: "#38383A",
  text: "#FFFFFF",
  muted: "#AEAEB2",
  subtle: "#AEAEB2",
  /** Decorative glyphs only (chevrons, grabbers); never body text. */
  tertiary: "#5A5A5E",
  /** Borderless control and search fills. */
  fill: "#2C2C2E",
  /** Floating menus and the selected segment, lifted above fills. */
  elevated: "#3A3A3C",
  accent: "#64B0FF",
  accentSolid: "#0071E3",
  primaryText: "#FFFFFF",
  info: "#64B0FF",
  live: "#64B0FF",
  success: "#32D74B",
  danger: "#FF6961",
  warning: "#FFD60A",
  brand: "#FFFFFF",
  selected: "#16273B",
  userMessage: "#2C2C2E",
  scrim: "#00000099",
};

export type MobileThemeMode = "light" | "dark";
export type MobileColors = typeof darkColors;
export const lightColors: MobileColors = {
  background: "#F2F2F7",
  panel: "#FFFFFF",
  raised: "#EEEEF0",
  border: "#D1D1D6",
  separator: "#E0E0E5",
  text: "#000000",
  muted: "#636366",
  subtle: "#636366",
  tertiary: "#C4C4C7",
  fill: "#E9E9EE",
  elevated: "#FFFFFF",
  accent: "#0066CC",
  accentSolid: "#0066CC",
  primaryText: "#FFFFFF",
  info: "#0066CC",
  live: "#0066CC",
  success: "#187A33",
  danger: "#C4141E",
  warning: "#8F5200",
  brand: "#000000",
  selected: "#E6EFFA",
  userMessage: "#EEEEF0",
  scrim: "#00000059",
};

export const themePalettes = { light: lightColors, dark: darkColors };
let activeTheme: MobileThemeMode = "dark";
const themeListeners = new Set<() => void>();
export const getMobileThemeMode = () => activeTheme;
export const subscribeMobileTheme = (listener: () => void) => {
  themeListeners.add(listener);
  return () => { themeListeners.delete(listener); };
};
/** Called by the single application provider; renderers subscribe with useMobileTheme. */
export function applyMobileTheme(mode: MobileThemeMode) {
  if (mode === activeTheme) return;
  activeTheme = mode;
  for (const listener of themeListeners) listener();
}

/** Stable semantic accessor; never capture one of its values at module scope. */
export const colors: MobileColors = Object.defineProperties({}, Object.fromEntries(
  Object.keys(darkColors).map((key) => [key, {
    enumerable: true,
    get: () => themePalettes[activeTheme][key as keyof MobileColors],
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
    get: () => semanticPalettes[activeTheme][key as keyof typeof semanticPalettes.dark],
  }]),
)) as typeof semanticPalettes.dark;
export type SemanticTone = keyof typeof semanticColors;

export const space = { xxs: 3, xs: 4, sm: 8, row: 12, md: 12, lg: 16, screen: 16, xl: 24, xxl: 32 };
export const radii = { badge: 6, control: 12, card: 20, preview: 22, sheet: 32, pill: 999 };
export const motion = { press: 120, reveal: 220, sheet: 280 };
export const fontSize = {
  micro: 11,
  caption: 12,
  badge: 12,
  small: 13,
  control: 16,
  body: 16,
  input: 17,
  title: 17,
  heading: 20,
  hero: 28,
  display: 34,
};
export const metrics = {
  controlHeight: 48,
  compactControlHeight: 48,
  inputHeight: 48,
  selectionHeight: 48,
  iconTarget: 48,
  touchTarget: 48,
  multilineHeight: 96,
  contentWidth: 760,
  entryWidth: 520,
  tabBarHeight: 64,
};
export const opacity = { disabled: 0.45, pressed: 0.72 };
export const monoFont = process.env.EXPO_OS === "ios" ? "Menlo" : "monospace";
