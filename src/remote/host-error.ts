import type { RemoteErrorKind } from "./types";

export class RemoteHostError extends Error {
  constructor(
    readonly machineId: string,
    readonly kind: RemoteErrorKind,
    message: string,
    /** The host may have accepted the write. Refresh or check its receipt before retrying. */
    readonly uncertain = false,
  ) {
    super(message);
    this.name = "RemoteHostError";
  }
}
