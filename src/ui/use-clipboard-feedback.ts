import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { useSingleFlight } from "@/state/actions";
import { isAppAccessAllowed, useSecurity } from "@/state/security";
import { usePrivateContentAccess } from "./private-access";

/** Exact prepared source, one current reader opening and one in-flight native write. */
export function useClipboardFeedback(payload: string, enabled = true, sharedFlight?: ReturnType<typeof useSingleFlight<void>>) {
  const localFlight = useSingleFlight<void>();
  const flight = sharedFlight ?? localFlight;
  const permission = usePrivateContentAccess();
  const access = useRef(permission); access.current = permission;
  const allowed = useCallback(() => {
    const state = useSecurity.getState();
    return isAppAccessAllowed() && state.appState === "active" && state.windowFocused && access.current.allowed && access.current.check();
  }, []);
  const [accessEpoch, setAccessEpoch] = useState(0);
  const owner = useMemo(() => ({ live: false }), [payload, enabled, permission, accessEpoch]);
  const current = useRef(owner); current.current = owner;
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => { owner.live = true; return () => { owner.live = false; }; }, [owner]);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<{ owner: typeof owner; error?: Error } | null>(null);
  // Retire synchronously even when lock/background and return are batched into one render.
  useLayoutEffect(() => useSecurity.subscribe(() => {
    if (mounted.current && !allowed()) {
      current.current.live = false;
      setAccessEpoch(value => value + 1);
      setOutcome(null);
    }
  }), [allowed]);
  const copy = useCallback(() => {
    const valid = () => owner.live && current.current === owner && enabled && allowed();
    if (!valid()) return;
    void flight.run(async () => {
      if (!valid()) return;
      setPending(true);
      setOutcome(null);
      try {
        await Clipboard.setStringAsync(payload);
        if (valid()) setOutcome({ owner });
      } catch (cause) {
        if (valid()) setOutcome({ owner, error: cause instanceof Error ? cause : new Error(String(cause)) });
      } finally {
        // An already-started OS write cannot be canceled. Keep the single flight
        // busy until it settles; never replay it for a new source/opening.
        if (mounted.current) setPending(false);
      }
    });
  }, [flight, payload, owner, enabled, allowed]);
  const result = outcome?.owner === owner ? outcome : null;
  return { copy, inFlight: pending, busy: enabled && pending, copied: !!result && !result.error, error: result?.error ?? null };
}
