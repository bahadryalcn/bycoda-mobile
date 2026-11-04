import { RemoteHostError } from "@/remote/host-error";

/** One unavailable computer can fail both reads; distinct failures retain their recovery. */
export function sameSessionListConnectionFailure(directoryError: unknown, sessionError: unknown) {
  return directoryError instanceof RemoteHostError && sessionError instanceof RemoteHostError &&
    directoryError.machineId === sessionError.machineId &&
    !directoryError.uncertain && !sessionError.uncertain &&
    (directoryError.kind === "network" || directoryError.kind === "timeout") &&
    directoryError.kind === sessionError.kind;
}
