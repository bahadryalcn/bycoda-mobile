import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as Sharing from "expo-sharing";
import { createSingleFlight } from "@/state/single-flight";
import { isAppAccessAllowed, useSecurity } from "@/state/security";
import { useCopy } from "./copy";

/** One explicit local-file handoff; changing/closing the reader never replays it. */
export function useMediaSharing({ uri, name, mimeType, enabled = true }: {
  uri?: string; name: string; mimeType?: string; enabled?: boolean;
}) {
  const copy = useCopy();
  const owner = useMemo(() => ({ live: false, flight: createSingleFlight<void>() }), [uri, name, mimeType, enabled]);
  const current = useRef(owner); current.current = owner;
  const accessRevision = useRef(0);
  const allowed = () => {
    const state = useSecurity.getState();
    return isAppAccessAllowed() && state.appState === "active" && state.windowFocused;
  };
  useLayoutEffect(() => useSecurity.subscribe(() => { if (!allowed()) accessRevision.current++; }), []);
  useLayoutEffect(() => { owner.live = true; return () => { owner.live = false; }; }, [owner]);
  const [outcome, setOutcome] = useState<{ owner: typeof owner; busy: boolean; error: unknown } | null>(null);
  const share = useCallback(() => {
    const access = accessRevision.current;
    const valid = () => owner.live && current.current === owner && enabled && allowed() && access === accessRevision.current;
    if (!uri || !valid()) return;
    void owner.flight.run(async () => {
      if (!valid()) return;
      setOutcome({ owner, busy: true, error: null });
      let error: unknown = null;
      try {
        const available = await Sharing.isAvailableAsync();
        if (!valid()) return;
        if (!available) throw new Error(copy("Bu cihazda paylaşım kullanılamıyor.", "Sharing is unavailable on this device."));
        await Sharing.shareAsync(uri, {
          dialogTitle: name,
          ...(mimeType ? { mimeType, displayName: name } : {}),
        });
      } catch (cause) {
        if (valid()) error = cause;
      } finally {
        if (owner.live && current.current === owner) setOutcome({ owner, busy: false, error });
      }
    });
  }, [owner, uri, name, mimeType, enabled, copy]);
  const reset = () => {
    if (!owner.live || current.current !== owner || !allowed() || owner.flight.isPending()) return false;
    setOutcome(null);
    return true;
  };
  return { share, reset, busy: outcome?.owner === owner && outcome.busy, error: outcome?.owner === owner ? outcome.error : null };
}
