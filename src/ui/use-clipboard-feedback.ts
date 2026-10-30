import { useCallback, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { useSingleFlight } from "@/state/actions";

type Outcome = { payload: string; error?: undefined } | { payload: string; error: Error };

/**
 * Native clipboard feedback for one prepared payload. Consumers prepare the exact string; this owns
 * the Clipboard call, synchronous single flight, and copied/error feedback. Feedback is bound to the
 * payload it was produced for, so a delayed result for an old (for example streamed) payload can never
 * mark the current payload copied or show an obsolete error.
 */
export function useClipboardFeedback(payload: string) {
  const flight = useSingleFlight<void>();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const copy = useCallback(() => {
    void flight.run(async () => {
      setPending(true);
      setOutcome(null);
      try {
        await Clipboard.setStringAsync(payload);
        setOutcome({ payload });
      } catch (cause) {
        setOutcome({ payload, error: cause instanceof Error ? cause : new Error(String(cause)) });
      } finally {
        setPending(false);
      }
    });
  }, [flight, payload]);
  const current = outcome?.payload === payload ? outcome : null;
  return { copy, busy: pending, copied: !!current && !current.error, error: current?.error ?? null };
}
