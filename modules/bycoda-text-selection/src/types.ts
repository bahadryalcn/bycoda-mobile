import type { StyleProp, ViewStyle } from "react-native";

/** A styled stretch of the paragraph, in UTF-16 offsets of `text` (same units as NSString and Java String). */
export type SelectableRun = {
  start: number;
  end: number;
  /** CSS-style numeric weight ("500", "700"); the paragraph weight when absent. */
  weight?: string;
  italic?: boolean;
  /** Platform monospace font (Menlo on iOS, monospace on Android), as `monoFont` in the app tokens. */
  mono?: boolean;
  strike?: boolean;
  /** Unscaled font size; the paragraph size when absent. */
  size?: number;
};

/** One custom item in the native selection menu, in display order. */
export type SelectableAction = { id: string; title: string };

/**
 * Begin a selection at a point (dp, relative to the view): the word under it is selected and the
 * menu is shown. A new token starts a new selection; the same token is applied once.
 */
export type SelectionStart = { x: number; y: number; token: number };

export type SelectionActionEvent = { action: string; text: string; start: number; end: number };
export type SelectionChangeEvent = { hasSelection: boolean };

export type NativeSelectableTextProps = {
  text: string;
  runs: SelectableRun[];
  /** Unscaled sizes; iOS multiplies by `fontScale` as React Native Text does, Android uses sp units. */
  fontSize: number;
  lineHeight: number;
  fontScale: number;
  fontWeight: string;
  /** Processed colors (`processColor`). The text is transparent by default: it is a selection layer over the visible text. */
  textColor?: number;
  selectionColor?: number;
  actions: SelectableAction[];
  start?: SelectionStart;
  onSelectionAction?: (event: { nativeEvent: SelectionActionEvent }) => void;
  onSelectionChange?: (event: { nativeEvent: SelectionChangeEvent }) => void;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
};
