import { createContext, useContext, type ReactNode } from "react";

/**
 * The recovery the latest failed turn offers, handed from the transcript owner to that turn's
 * failure card (desktop links them with `useFailedTurnRecovery` / `UsageLimitRecoveryContext`).
 * Each part names the failure block it belongs to, so an older failure never shows it.
 */
export type FailureRecovery = {
  retry?: { errorId: string; pending: boolean; onRetry: () => void };
  /** Draws the usage-limit notice in place of the card's status line, keeping the card's Details. */
  usageLimit?: { errorId: string; render: (details: ReactNode) => ReactNode };
};

export const FailureRecoveryContext = createContext<FailureRecovery | undefined>(undefined);

export function useFailureRecovery(errorId: string | undefined) {
  const recovery = useContext(FailureRecoveryContext);
  if (!errorId || !recovery) return {};
  return {
    retry: recovery.retry?.errorId === errorId ? recovery.retry : undefined,
    usageLimit: recovery.usageLimit?.errorId === errorId ? recovery.usageLimit.render : undefined,
  };
}
