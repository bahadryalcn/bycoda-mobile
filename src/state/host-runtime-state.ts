import { useSyncExternalStore } from "react";
import type { MobileHostRuntimeState } from "./host-runtime";

/**
 * Last live socket state per computer, fed by the app runtime's existing state observer.
 * Presentation only: it never starts, retries or closes a connection. A computer with no entry
 * (legacy HTTP cohort, web, no lease yet) has no live-socket evidence.
 */
const states = new Map<string, MobileHostRuntimeState>();
const recoveringSince = new Map<string, number>();
const listeners = new Set<() => void>();
let startupFailed = false;

/** An app-wide installation failure, separate from an individual computer's link. */
export function recordHostRuntimeStartupFailed(failed: boolean): void {
  if (startupFailed === failed) return;
  startupFailed = failed;
  for (const listener of [...listeners]) listener();
}

const readStartupFailure = () => startupFailed;
export function useHostRuntimeStartupFailed(): boolean {
  return useSyncExternalStore(subscribeHostRuntimeStates, readStartupFailure, readStartupFailure);
}

export function recordHostRuntimeState(machineId: string, state: MobileHostRuntimeState): void {
  if (states.get(machineId) === state) return;
  states.set(machineId, state);
  if (state !== "connecting" && state !== "backoff") recoveringSince.delete(machineId);
  else if (!recoveringSince.has(machineId)) recoveringSince.set(machineId, Date.now());
  for (const listener of [...listeners]) listener();
}

export function hostRuntimeState(machineId: string | null | undefined): MobileHostRuntimeState | undefined {
  return machineId ? states.get(machineId) : undefined;
}

/**
 * When the current unbroken connect/backoff cycle began, shared by every status surface. While the
 * app is away the clock is held at "now": the OS closes the socket in the background and the
 * runtime retries there, but that time is no failed reconnect the user could have watched.
 */
export function hostRecoveringSince(machineId: string | null | undefined): number | null {
  const since = (machineId ? recoveringSince.get(machineId) : undefined) ?? null;
  return since !== null && recoveryHeld ? Date.now() : since;
}

let recoveryHeld = false;
let foregroundGeneration = 0;

/** The app left the foreground: reconnect time from here on does not count against any grace. */
export function holdHostRecoveryClocks(): void {
  if (recoveryHeld) return;
  recoveryHeld = true;
  for (const listener of [...listeners]) listener();
}

/**
 * The app returned to the foreground. The socket has to reconnect first, so every running recovery
 * cycle starts its grace over and every read-feedback grace restarts with the new generation:
 * a resume shows its placeholder or retained data quietly instead of a momentary error.
 */
export function resumeHostRecoveryClocks(): void {
  if (!recoveryHeld) return;
  recoveryHeld = false;
  const now = Date.now();
  for (const machineId of recoveringSince.keys()) recoveringSince.set(machineId, now);
  foregroundGeneration++;
  for (const listener of [...listeners]) listener();
}

const readForegroundGeneration = () => foregroundGeneration;
/** Changes on every return to the foreground; feedback graces restart with it. */
export function useHostForegroundGeneration(): number {
  return useSyncExternalStore(subscribeHostRuntimeStates, readForegroundGeneration, readForegroundGeneration);
}

export function subscribeHostRuntimeStates(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Live socket state of one computer; re-renders only when that computer's state changes. */
export function useHostRuntimeState(machineId: string | null | undefined): MobileHostRuntimeState | undefined {
  return useSyncExternalStore(
    subscribeHostRuntimeStates,
    () => hostRuntimeState(machineId),
    () => hostRuntimeState(machineId),
  );
}

/** The selected computer, mirrored here so shared presentation can read its link without the machines store. */
let activeMachineId: string | null = null;
export function recordActiveHostMachine(machineId: string | null): void {
  if (activeMachineId === machineId) return;
  activeMachineId = machineId;
  for (const listener of [...listeners]) listener();
}

/** The connection pill's verdict for the selected computer, published by its health owner. */
let activeDisconnected = false;
export function recordActiveHostDisconnected(disconnected: boolean): void {
  if (activeDisconnected === disconnected) return;
  activeDisconnected = disconnected;
  for (const listener of [...listeners]) listener();
}

/**
 * The selected computer cannot be reached right now: its socket waits to retry, or (without a
 * live socket) the connection pill already says Disconnected.
 */
export function useActiveHostLinkDown(): boolean {
  const read = () => activeDisconnected || hostRuntimeState(activeMachineId) === "backoff";
  return useSyncExternalStore(subscribeHostRuntimeStates, read, read);
}

/** The current live socket is actively attempting to recover. */
export function useActiveHostRecoveryMachine(): string | null {
  const read = () => {
    const state = hostRuntimeState(activeMachineId);
    return state === "backoff" || state === "connecting" ? activeMachineId : null;
  };
  return useSyncExternalStore(subscribeHostRuntimeStates, read, read);
}

/** Test seam: forget every recorded state. */
export function resetHostRuntimeStates(): void {
  activeMachineId = null;
  activeDisconnected = false;
  startupFailed = false;
  recoveryHeld = false;
  foregroundGeneration = 0;
  states.clear();
  recoveringSince.clear();
  for (const listener of [...listeners]) listener();
}
