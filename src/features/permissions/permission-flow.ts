import { duringSystemPrompt } from "@/state/system-prompt";
export type DevicePermission = { granted: boolean; canAskAgain: boolean; status: string };

/**
 * Every request reaches the OS first; Settings is recovery for a denial the OS confirms permanent.
 * A cached "cannot ask again" is not trusted on its own: Android reports it after a request for a
 * permission the build did not declare, and after the declaration is fixed the OS can ask again.
 * For a real permanent denial the OS answers at once without showing anything.
 */
export async function requestDevicePermission(
  read: () => Promise<DevicePermission>,
  request: () => Promise<DevicePermission>,
  openSettings: () => Promise<void>,
) {
  const current = await read();
  if (current.granted) return current;
  const answered = await duringSystemPrompt(request);
  if (!answered.granted && !answered.canAskAgain) await openSettings();
  return answered;
}
