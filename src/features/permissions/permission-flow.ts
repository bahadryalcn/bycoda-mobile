export type DevicePermission = { granted: boolean; canAskAgain: boolean; status: string };

/** A first request must reach the OS; Settings is recovery for a permanent denial. */
export async function requestDevicePermission(
  read: () => Promise<DevicePermission>,
  request: () => Promise<DevicePermission>,
  openSettings: () => Promise<void>,
) {
  const current = await read();
  if (current.granted) return current;
  if (current.canAskAgain) return request();
  await openSettings();
  return current;
}
