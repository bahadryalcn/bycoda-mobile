import type { DeviceChannel, DevicePlatform, DeviceRegistration } from "../contracts";

export interface DeviceInfo {
  name: string;
  platform: "ios" | "android";
  osVersion: string;
  appVersion: string;
  channel: DeviceChannel;
}

/** Development builds report `dev`; other builds are `preview` only when flagged. */
export function releaseChannel(isDev: boolean, flag: string | undefined): DeviceChannel {
  if (isDev) return "dev";
  return flag === "preview" ? "preview" : "stable";
}

const trim = (value: string, max: number) => [...value.trim()].slice(0, max).join("");

/** The body of `POST /v1/devices`; `deviceId` is sent only once the server has issued one. */
export function deviceRegistration(info: DeviceInfo, deviceId: string | null): DeviceRegistration {
  const platform: DevicePlatform = info.platform;
  return {
    ...(deviceId ? { deviceId } : {}),
    name: trim(info.name, 80) || (platform === "ios" ? "iPhone" : "Android phone"),
    platform,
    osVersion: trim(info.osVersion, 64),
    appVersion: trim(info.appVersion, 32),
    channel: info.channel,
    kind: "mobile",
  };
}
