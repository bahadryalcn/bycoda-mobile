import type { PropsWithChildren, ReactNode } from "react";
import { View } from "react-native";

export type SwipeRowAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onPress(): void;
};

/**
 * Rows do not swipe. One convention app-wide: a row's actions open from its options control,
 * the visible "…" (notes and management records) or a long press, which screen readers reach
 * through the row's named "options" accessibility action (projects, sessions, changed files).
 *
 * Swiping rows was removed after device testing: an open rail clipped the row's text and
 * divider, floated the row's "…" over the actions, and a tap meant to close it opened the
 * record instead. `actions` stays in the signature so callers keep describing the same row
 * actions their options menu offers; nothing slides, so a tap always does what it says.
 * @deprecated A pass-through: render the row directly and drop the unused `actions` arrays.
 */
export function SwipeActions({ children }: PropsWithChildren<{
  actions: readonly SwipeRowAction[];
  disabled?: boolean;
}>) {
  return <>{children}</>;
}

/** Kept for list owners; with no swipe rail it only passes `fill` to its viewport. */
export function SwipeActionsGroup({ children, fill }: PropsWithChildren<{ fill?: boolean }>) {
  return fill ? <View style={{ flex: 1, minHeight: 0 }}>{children}</View> : <>{children}</>;
}
