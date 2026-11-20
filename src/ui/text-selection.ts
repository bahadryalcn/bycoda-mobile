import { createContext, use } from "react";

export const PressableTextContext = createContext(false);

/**
 * Android ignores `numberOfLines` truncation on selectable text, so a one-line title
 * wraps and overlaps its neighbours. Line-limited text is not selectable unless a
 * caller opts in explicitly with `selectable`.
 */
export function selectableByDefault(numberOfLines: number | undefined): boolean {
  return !numberOfLines;
}

export function useDefaultTextSelection(numberOfLines: number | undefined): boolean {
  const insidePressable = use(PressableTextContext);
  return !insidePressable && selectableByDefault(numberOfLines);
}
