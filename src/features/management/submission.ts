import { createSingleFlight } from "@/state/single-flight";

/** Preserve legacy false-on-duplicate semantics using the shared action gate. */
export function createSubmissionGate() {
  const flight = createSingleFlight<boolean>();
  return {
    isPending: flight.isPending,
    async run(action: () => Promise<unknown>): Promise<boolean> {
      if (flight.isPending()) return false;
      return flight.run(async () => {
        await action();
        return true;
      });
    },
  };
}
