import {
  ApiErrorEnvelope,
  createAccountClient,
  type AccountClient,
  type Device,
  type DeviceRegistration,
} from "../contracts";

/** Sent on every account call so the server can answer `device_revoked` after a remote sign-out. */
export const DEVICE_HEADER = "X-Bycoda-Device";

export interface DeviceIdStore {
  read(): Promise<string | null>;
  write(id: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AccountRuntimeOptions {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  fetch: typeof fetch;
  store: DeviceIdStore;
  /** The server revoked this device: sign out locally and keep every local file and setting. */
  onDeviceRevoked: () => void | Promise<void>;
}

export interface AccountRuntime {
  client: AccountClient;
  deviceId(): Promise<string | null>;
  /** Upserts this device and remembers the id the server returns. */
  registerDevice(registration: (deviceId: string | null) => DeviceRegistration): Promise<Device>;
  /** Best effort: tell the server this device signs out, then forget the stored id. */
  releaseDevice(): Promise<void>;
}

async function isDeviceRevoked(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  try {
    const parsed = ApiErrorEnvelope.safeParse(await response.clone().json());
    return parsed.success && parsed.data.error.code === "device_revoked";
  } catch {
    return false;
  }
}

export function createAccountRuntime(options: AccountRuntimeOptions): AccountRuntime {
  let cached: string | null = null;
  let loaded = false;
  const deviceId = async () => {
    if (!loaded) {
      cached = await options.store.read();
      loaded = true;
    }
    return cached;
  };
  const forget = async () => {
    cached = null;
    loaded = true;
    await options.store.clear();
  };

  const deviceFetch: typeof fetch = async (input, init) => {
    const id = await deviceId();
    const headers = new Headers(init?.headers);
    if (id) headers.set(DEVICE_HEADER, id);
    const response = await options.fetch(input, { ...init, headers });
    if (await isDeviceRevoked(response)) {
      await forget();
      await options.onDeviceRevoked();
    }
    return response;
  };

  const client = createAccountClient({
    baseUrl: options.baseUrl,
    getAccessToken: options.getToken,
    fetch: deviceFetch,
  });

  return {
    client,
    deviceId,
    async registerDevice(registration) {
      const device = await client.registerDevice({ body: registration(await deviceId()) });
      cached = device.id;
      loaded = true;
      await options.store.write(device.id);
      return device;
    },
    async releaseDevice() {
      const id = await deviceId();
      try {
        if (id) await client.revokeDevice({ params: { id } });
      } catch {
        // shortcut: an offline or failed release leaves this device listed until it is removed from another device or the portal.
      }
      await forget();
    },
  };
}
