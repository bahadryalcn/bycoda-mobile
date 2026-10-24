import type { ReactNode } from "react";
import type { PrivateContentAccess } from "./private-content";

export type OverlayEntry = {
  children: ReactNode;
  onClose(): void;
  priority: number;
  label?: string;
  privateAccess?: PrivateContentAccess;
};

export type OverlayRegistry = {
  update(id: string, entry: OverlayEntry): void;
  remove(id: string): void;
};

export type ScreenOverlayProps = Omit<OverlayEntry, "priority"> & {
  visible: boolean;
  priority?: number;
};
