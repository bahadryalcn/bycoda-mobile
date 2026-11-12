import type { AccountClient } from "../contracts";
import type { PushMarkStore } from "./device-store";

export type PushSyncResult = "registered" | "unchanged";

/**
 * Registers this phone's Expo push token for the signed-in device. A token the service already
 * holds for the same device is not sent again; a changed token or a new device id is.
 */
export async function syncPushToken(options: {
  client: AccountClient;
  deviceId: string;
  token: string;
  marks: PushMarkStore;
}): Promise<PushSyncResult> {
  const mark = `${options.deviceId}|${options.token}`;
  if ((await options.marks.read()) === mark) return "unchanged";
  await options.client.setPushToken({
    params: { id: options.deviceId },
    body: { provider: "expo", token: options.token },
  });
  await options.marks.write(mark);
  return "registered";
}
