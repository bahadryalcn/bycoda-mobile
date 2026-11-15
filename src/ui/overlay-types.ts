import type { ReactNode } from "react";
import type { PrivateContentAccess } from "./private-content";

export type OverlayEntry = {
  children: ReactNode;
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
};

export type ScreenOverlayProps = Omit<OverlayEntry, "priority" | "routeFocused"> & {
  visible: boolean;
  priority?: number;
};
