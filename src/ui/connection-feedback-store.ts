/**
 * Which query state in one region (a sheet or a screen) shows a connection-level problem
 * (access revoked, waiting for the computer, offline, Host update needed). The topmost
 * claimant shows it; later sections stay quiet so one region never repeats the same failure.
 * `order` is the claimant's mount order, which follows layout order within one render, so the
 * message sits in the first section regardless of which request failed first.
 */
export type ConnectionFeedbackStore = {
  claim(id: string, order: number): void;
  release(id: string): void;
  owner(): string | undefined;
  subscribe(listener: () => void): () => void;
};

export function createConnectionFeedbackStore(): ConnectionFeedbackStore {
  const claims = new Map<string, number>();
  let current: string | undefined;
  const listeners = new Set<() => void>();
  const settle = () => {
    let next: string | undefined;
    let lowest = Infinity;
    for (const [id, order] of claims) if (order < lowest) [next, lowest] = [id, order];
    if (next === current) return;
    current = next;
    listeners.forEach((listener) => listener());
  };
  return {
    claim(id, order) {
      claims.set(id, order);
      settle();
    },
    release(id) {
      if (claims.delete(id)) settle();
    },
    owner: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
