import { createSingleFlight } from "../state/single-flight";

/**
 * Which query state in one region (a sheet or a screen) shows a connection-level problem
 * (access revoked, waiting for the computer, offline, Host update needed). The topmost
 * claimant shows it; later sections stay quiet so one region never repeats the same failure.
 * `order` is the claimant's mount order, which follows layout order within one render, so the
 * message sits in the first section regardless of which request failed first.
 */
export type ConnectionFeedbackStore = {
  claim(id: string, order: number, retry?: () => unknown): void;
  release(id: string): void;
  owner(): string | undefined;
  retry(): Promise<void>;
  subscribe(listener: () => void): () => void;
};

export function createConnectionFeedbackStore(): ConnectionFeedbackStore {
  const claims = new Map<string, { order: number; retry?: () => unknown }>();
  const retryFlight = createSingleFlight<void>();
  let current: string | undefined;
  const listeners = new Set<() => void>();
  const settle = () => {
    let next: string | undefined;
    let lowest = Infinity;
    for (const [id, { order }] of claims) if (order < lowest) [next, lowest] = [id, order];
    if (next === current) return;
    current = next;
    listeners.forEach((listener) => listener());
  };
  return {
    claim(id, order, retry) {
      claims.set(id, { order, retry });
      settle();
    },
    release(id) {
      if (claims.delete(id)) settle();
    },
    owner: () => current,
    retry: () => retryFlight.run(async () => {
      await Promise.allSettled(Array.from(claims.values(), async ({ retry }) => retry?.()));
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
