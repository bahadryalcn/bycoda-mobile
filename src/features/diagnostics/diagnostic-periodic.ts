import type { DiagnosticMode } from "./diagnostic-prefs";
import type { DiagnosticSendResult } from "./diagnostic-report";
import { shouldSendPeriodic } from "./diagnostic-startup";

const HOUR_MS = 3_600_000;
/** How long the automatic upload stays quiet after a result that did not send, so a foreground does not retry at once. */
export const PERIODIC_RETRY_BACKOFF_MS: Record<Exclude<DiagnosticSendResult, "sent">, number> = {
  failed: HOUR_MS,
  "rate-limited": 24 * HOUR_MS,
  "not-configured": 24 * HOUR_MS,
  empty: 24 * HOUR_MS,
};

export interface PeriodicDiagnosticsDeps {
  /** Live consent, read again before every step that follows an await. */
  mode(): DiagnosticMode | null;
  readLastSent(): Promise<Date | null>;
  writeLastSent(at: Date): Promise<unknown>;
  readRetryAt(): Promise<Date | null>;
  writeRetryAt(at: Date): Promise<unknown>;
  now(): Date;
}

/**
 * Weekly automatic upload with one run at a time: a second trigger while a run is still collecting
 * joins it instead of starting another upload. Only `sent` records the weekly date; every other
 * result records a retry time, so offline, rate-limited and unconfigured builds do not rebuild the
 * report on each foreground. Consent is checked before reading state and again right before sending.
 */
export function createPeriodicDiagnostics(deps: PeriodicDiagnosticsDeps) {
  let inFlight: Promise<void> | null = null;

  const attempt = async (send: () => Promise<DiagnosticSendResult>) => {
    const last = await deps.readLastSent();
    if (!shouldSendPeriodic(deps.mode(), last, deps.now())) return;
    const retryAt = await deps.readRetryAt();
    if (retryAt && deps.now().getTime() < retryAt.getTime()) return;
    // Consent may have been withdrawn while the stored dates were read.
    if (!shouldSendPeriodic(deps.mode(), last, deps.now())) return;
    const result = await send();
    if (result === "sent") await deps.writeLastSent(deps.now());
    else await deps.writeRetryAt(new Date(deps.now().getTime() + PERIODIC_RETRY_BACKOFF_MS[result]));
  };

  return {
    run(send: () => Promise<DiagnosticSendResult>): Promise<void> {
      if (inFlight) return inFlight;
      const current = attempt(send).finally(() => {
        if (inFlight === current) inFlight = null;
      });
      inFlight = current;
      return current;
    },
  };
}
