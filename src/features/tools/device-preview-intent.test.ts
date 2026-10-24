import { afterEach, expect, it, vi } from "vitest";
import { claimPreviewIntent, clearPreviewIntent, loadPreviewIntent } from "./device-preview-intent";
const state = vi.hoisted(() => ({ values: new Map<string, string>(), fail: false }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => state.values.get(key) ?? null,
  setItem: async (key: string, value: string) => { if (state.fail) throw new Error("Storage failed"); state.values.set(key, value); },
  removeItem: async (key: string) => { state.values.delete(key); },
} }));
const scope = { machineId: "machine", environmentId: "host", projectId: "project", deviceId: "sim" };
const intent = { requestId: "request", deviceId: "sim", url: "exp://127.0.0.1:8081", installExpoGo: false };
afterEach(() => { state.values.clear(); state.fail = false; });
it("persists before transport, refuses a competing new request, and preserves exact scope after restart", async () => {
  await claimPreviewIntent(scope, intent); expect(await loadPreviewIntent(scope)).toEqual(intent);
  await expect(claimPreviewIntent(scope, { ...intent, requestId: "other" })).rejects.toThrow("Reconcile");
  for (const name of ["machineId", "environmentId", "projectId", "deviceId"])
    expect(await loadPreviewIntent({ ...scope, [name]: "other" })).toBeNull();
  await clearPreviewIntent(scope, "other"); expect(await loadPreviewIntent(scope)).toEqual(intent);
  await clearPreviewIntent(scope, "request"); expect(await loadPreviewIntent(scope)).toBeNull();
});
it("storage failure or corrupt recovery cannot silently replace an existing intent", async () => {
  state.fail = true; await expect(claimPreviewIntent(scope, intent)).rejects.toThrow("Storage failed"); state.fail = false;
  await claimPreviewIntent(scope, intent); for (const key of state.values.keys()) state.values.set(key, "corrupt");
  await expect(loadPreviewIntent(scope)).rejects.toThrow(); await expect(claimPreviewIntent(scope, intent)).rejects.toThrow("Reconcile");
});
