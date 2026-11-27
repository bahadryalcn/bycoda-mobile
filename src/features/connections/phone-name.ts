import { readDeviceInfo } from "../account/model/device-info";

/**
 * The name this phone registers under on a computer: the device's own name (or model), so several
 * phones can be told apart in the computer's device list. The same name the account service shows.
 */
export function pairingPhoneName(): string {
  try {
    const name = readDeviceInfo().name.trim().slice(0, 120);
    return name || "Bycoda phone";
  } catch {
    return "Bycoda phone";
  }
}
