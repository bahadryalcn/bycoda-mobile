import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { QueueSummary } from "./session-status-cluster-model";

type Sinks = {
  summary: (summary: QueueSummary | null) => void;
  /** The transcript reports that it is drawing the floating cluster; returns the unregister. */
  register: () => () => void;
};

const Sink = createContext<Sinks | null>(null);
const Value = createContext<QueueSummary | null>(null);
const Present = createContext(false);

/**
 * Carries the composer-owned queue's count to the session transcript's floating status cluster,
 * and whether that cluster is on screen at all. The queue, its sheet and its auto-send stay in
 * `SessionQueue`; only the summary and its "open" action cross. While the transcript is not
 * drawing the cluster (a cited-turn search, a repair state, a render failure) the composer strip
 * keeps the queue count and the run state itself.
 */
export function SessionStatusClusterProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [mounted, setMounted] = useState(0);
  const sinks = useMemo<Sinks>(() => ({
    summary: setSummary,
    register: () => {
      setMounted((count) => count + 1);
      return () => setMounted((count) => count - 1);
    },
  }), []);
  return (
    <Sink.Provider value={sinks}>
      <Present.Provider value={mounted > 0}>
        <Value.Provider value={summary}>{children}</Value.Provider>
      </Present.Provider>
    </Sink.Provider>
  );
}

/** Null outside the provider; the queue publishes its summary here whether or not the cluster shows. */
export const useStatusClusterQueueSink = () => useContext(Sink)?.summary ?? null;
export const useStatusClusterQueue = () => useContext(Value);
/** The floating cluster is on screen and owns the run state and queue count; the composer strip does not repeat them. */
export const useStatusClusterPresent = () => useContext(Present);

/** Called by the transcript while it draws the floating cluster. */
export function useRegisterStatusCluster(active: boolean) {
  const register = useContext(Sink)?.register;
  useEffect(() => (active && register ? register() : undefined), [active, register]);
}
