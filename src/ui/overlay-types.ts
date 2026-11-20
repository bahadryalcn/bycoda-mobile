import type { ReactNode } from "react";
import type { PrivateContentAccess } from "./private-content";

/** Layer identity held in provider state. Content is published separately through `setContent`. */
export type OverlayEntry = {
  onClose(): void;
  priority: number;
  label?: string;
  privateAccess?: PrivateContentAccess;
  /** Inactive route content stays mounted but cannot cover the current screen. */
  routeFocused?: boolean;
};

export type OverlayRegistry = {
  update(id: string, entry: OverlayEntry): void;
  remove(id: string): void;
  /** Drops the layer and its content at once (used on lock). */
  drop(id: string): void;
  setContent(id: string, children: ReactNode): void;
};

export type ScreenOverlayProps = Omit<OverlayEntry, "priority" | "routeFocused"> & {
  children: ReactNode;
  visible: boolean;
  priority?: number;
};
