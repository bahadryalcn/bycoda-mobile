/** Claim the action before the first await, including validation and confirmation receipts. */
export function createSingleFlight<T>() {
  let pending: Promise<T> | null = null;
  return {
    isPending: () => pending !== null,
    run(action: () => Promise<T>): Promise<T> {
      if (pending) return pending;
      const execution = Promise.resolve().then(action);
      const result = execution.finally(() => {
        if (pending === result) pending = null;
      });
      pending = result;
      return result;
    },
  };
}
