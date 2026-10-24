import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AccessTarget, HostAccessReport } from "./access-center-model";

// Persist before transport. Leaving the sheet, switching machines or restarting
// the phone cannot turn an unknown start into a fresh exposure request.
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(run: () => Promise<T>): Promise<T> => {
  const next = queue.then(run, run); queue = next.catch(() => {}); return next;
};
const key = (target: AccessTarget) => `bycoda.tunnel-intent.v1:${encodeURIComponent(target.machineId)}:${encodeURIComponent(target.environmentId)}`;
export const hasTunnelIntent = (target: AccessTarget) => serial(async () => (await AsyncStorage.getItem(key(target))) !== null);
export const claimTunnelIntent = (target: AccessTarget, input: Record<string, unknown>) => serial(async () => {
  if (await AsyncStorage.getItem(key(target)) !== null) return false;
  await AsyncStorage.setItem(key(target), JSON.stringify({ at: Date.now(), input })); return true;
});
export const clearTunnelIntent = (target: AccessTarget) => serial(() => AsyncStorage.removeItem(key(target)));
export const reconcileTunnelIntent = (target: AccessTarget, overview: NonNullable<HostAccessReport["tunnels"]>) => serial(async () => {
  const raw = await AsyncStorage.getItem(key(target));
  if (raw === null) return false;
  if (raw.length > 4096) return true;
  try {
    const value = JSON.parse(raw) as { input?: Record<string, unknown> };
    const input = value.input;
    if (!input || typeof input !== "object") return true;
    const observed = typeof input.id === "string"
      ? overview.tunnels.some((row) => row.id === input.id && !row.canStop && ["stopped", "error", "interrupted"].includes(row.state))
      : overview.tunnels.some((row) => row.provider === input.provider && row.target === input.target && row.canStop &&
          ["starting", "ready"].includes(row.state) && (input.target === "host" || row.localUrl === input.localUrl));
    if (!observed) return true;
    await AsyncStorage.removeItem(key(target)); return false;
  } catch { return true; }
});
