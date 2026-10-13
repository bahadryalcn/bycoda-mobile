export const colors = {
  // A pocket workbench: OLED black, graphite surfaces, and bycoda's cool signal.
  background: "#000000",
  panel: "#101113",
  raised: "#1B1E22",
  border: "#383D45",
  separator: "#24272C",
  text: "#F2F4F7",
  muted: "#A1A8B1",
  subtle: "#858D98",
  accent: "#A6D8FA",
  accentSolid: "#A6D8FA",
  primaryText: "#071723",
  info: "#A6D8FA",
  live: "#80CFFF",
  success: "#89DDB8",
  danger: "#FFA1AB",
  warning: "#EBCB8B",
  brand: "#F2F4F7",
  selected: "#172732",
  userMessage: "#151D24",
  scrim: "#000000B3",
};

/** Native-safe equivalents of the same semantic color, tint and border. */
export const semanticColors = {
  info: { text: colors.info, surface: "#0C1B25", border: "#2C4D62" },
  success: { text: colors.success, surface: "#0D211A", border: "#305846" },
  warning: { text: colors.warning, surface: "#231D10", border: "#655432" },
  danger: { text: colors.danger, surface: "#28151B", border: "#6B3843" },
};
export type SemanticTone = keyof typeof semanticColors;

export const space = { xxs: 3, xs: 4, sm: 8, row: 10, md: 12, lg: 16, screen: 20, xl: 24 };
export const radii = { badge: 6, control: 12, card: 16, preview: 22, sheet: 28 };
export const motion = { press: 110, reveal: 180, sheet: 240 };
export const fontSize = {
  micro: 11,
  caption: 12,
  badge: 12,
  small: 13,
  control: 14,
  body: 15,
  input: 16,
  title: 16,
  heading: 26,
  hero: 28,
  display: 32,
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
  tabBarHeight: 56,
};
export const opacity = { disabled: 0.45, pressed: 0.72 };
export const monoFont = process.env.EXPO_OS === "ios" ? "Menlo" : "monospace";
