import type { DevicePermissionKind } from "./device-permissions";
import type { DevicePermission } from "./permission-flow";

/** One status read per permission kind; a failure in one never hides another. */
export type PermissionRead =
  | { status: "pending" }
  | { status: "ready"; permission: DevicePermission }
  | { status: "error"; error: unknown };
export type PermissionReads = Record<DevicePermissionKind, PermissionRead>;

export const permissionKinds: readonly DevicePermissionKind[] = ["camera", "microphone", "notifications"];
export const pendingPermissionReads = (): PermissionReads => ({ camera: { status: "pending" }, microphone: { status: "pending" }, notifications: { status: "pending" } });

/** Reads status only (never requests). Resolves with an independent outcome for each requested kind;
 * onSettled reports each kind as soon as its own read settles, so a slow read never delays another row. */
export async function readDevicePermissionStatuses(
  kinds: readonly DevicePermissionKind[],
  read: (kind: DevicePermissionKind) => Promise<DevicePermission>,
  onSettled?: (kind: DevicePermissionKind, outcome: PermissionRead) => void,
): Promise<Partial<PermissionReads>> {
  const next: Partial<PermissionReads> = {};
  await Promise.all(kinds.map(async (kind) => {
    let outcome: PermissionRead;
    try { outcome = { status: "ready", permission: await read(kind) }; }
    catch (error) { outcome = { status: "error", error }; }
    next[kind] = outcome;
    onSettled?.(kind, outcome);
  }));
  return next;
}

/** A retry shows Checking only for failed reads; usable rows keep their last result meanwhile. */
export function markRetrying(reads: PermissionReads, kinds: readonly DevicePermissionKind[]): PermissionReads {
  const retrying = kinds.filter((kind) => reads[kind].status === "error");
  if (!retrying.length) return reads;
  const next = { ...reads };
  for (const kind of retrying) next[kind] = { status: "pending" };
  return next;
}

export const failedPermissionKinds = (reads: PermissionReads) => permissionKinds.filter((kind) => reads[kind].status === "error");
