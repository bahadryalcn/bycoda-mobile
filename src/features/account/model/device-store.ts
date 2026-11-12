import * as SecureStore from "expo-secure-store";
import type { DeviceIdStore } from "./account-runtime";

const DEVICE_KEY = "bycoda.account.deviceId";
const PUSH_KEY = "bycoda.account.pushToken";

/** The device id the account service issued, kept in the keychain with the sign-in tokens. */
export const secureDeviceIdStore: DeviceIdStore = {
  read: async () => (await SecureStore.getItemAsync(DEVICE_KEY)) || null,
  write: (id) => SecureStore.setItemAsync(DEVICE_KEY, id),
  clear: () => SecureStore.deleteItemAsync(DEVICE_KEY),
};

/** Remembers which Expo push token the service already holds, as `deviceId|token`. */
export interface PushMarkStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}
export const securePushMarkStore: PushMarkStore = {
  read: async () => (await SecureStore.getItemAsync(PUSH_KEY)) || null,
  write: (value) => SecureStore.setItemAsync(PUSH_KEY, value),
  clear: () => SecureStore.deleteItemAsync(PUSH_KEY),
};
