import type { RemoteErrorKind } from "./types";

export class RemoteHostError extends Error {
  constructor(
    readonly machineId: string,
    readonly kind: RemoteErrorKind,
    message: string,
    /** The host may have accepted the write. Refresh or check its receipt before retrying. */
    readonly uncertain = false,
    /** The Host itself answered with a deadline error: it is reachable but too slow, so waiting again automatically only repeats the wait. Retry stays explicit. */
    readonly hostDeadline = false,
    /** The Host's stable refusal code, e.g. CONTEXT_CHANGED after a Host restart. */
    readonly code?: string,
  ) {
    super(message);
    this.name = "RemoteHostError";
  }
}
