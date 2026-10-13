import type { ReactNode } from "react";

export type OverlayEntry = {
  children: ReactNode;
  onClose(): void;
  priority: number;
};

export type OverlayRegistry = {
  update(id: string, entry: OverlayEntry): void;
  remove(id: string): void;
};

export type ScreenOverlayProps = Omit<OverlayEntry, "priority"> & {
  visible: boolean;
  priority?: number;
};
