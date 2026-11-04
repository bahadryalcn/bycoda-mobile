import { createContext } from "react";

export type SheetGuardState = { dirty?: boolean; pending?: boolean };

/** Lightweight boundary shared by readers and the Sheet dismissal owner. */
export const SheetGuardContext = createContext<{
  register(id: string, guard: SheetGuardState | null): void;
  requestClose(): void;
  requestCloseThen(afterClose: () => void): void;
  requestCloseStackThen?(afterClose: () => void): void;
  blocked?: boolean;
} | null>(null);
