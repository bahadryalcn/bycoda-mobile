import { afterEach, expect, it, vi } from "vitest";
import { claimTunnelIntent, clearTunnelIntent, hasTunnelIntent, reconcileTunnelIntent } from "./access-tunnel-intent";
const state = vi.hoisted(() => ({ values: new Map<string, string>(), fail: false }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => state.values.get(key) ?? null,
  setItem: async (key: string, value: string) => { if (state.fail) throw new Error("Storage failed"); state.values.set(key, value); },
  removeItem: async (key: string) => { state.values.delete(key); },
} }));
const target = { machineId: "phone", environmentId: "host" };
const input = { provider: "cloudflare", target: "dev-server", localUrl: "http://127.0.0.1:3000" };
const overview = { providers: [], tunnels: [], publicReachability: "unverified" as const };
afterEach(() => { state.values.clear(); state.fail = false; });
it("serializes concurrent starts and retains unknown intents across reader remounts and machine switches", async () => {
  expect(await Promise.all([claimTunnelIntent(target, input), claimTunnelIntent(target, input)])).toEqual([true, false]);
  expect(await hasTunnelIntent(target)).toBe(true);
  expect(await hasTunnelIntent({ ...target, environmentId: "other" })).toBe(false);
  expect(await reconcileTunnelIntent(target, overview)).toBe(true);
  expect(await claimTunnelIntent(target, { ...input, provider: "ngrok" })).toBe(false);
});
it("only reconciles an observed owned exact target, not absent, foreign, or ended starts", async () => {
  await claimTunnelIntent(target, input);
  const row = { ...input, provider: "cloudflare" as const, target: "dev-server" as const, id: "tunnel", startedAt: 1, state: "ready" as const, canStop: true };
  expect(await reconcileTunnelIntent(target, { ...overview, tunnels: [{ ...row, localUrl: "http://127.0.0.1:4000" }] })).toBe(true);
  expect(await reconcileTunnelIntent(target, { ...overview, tunnels: [{ ...row, canStop: false, state: "interrupted" }] })).toBe(true);
  expect(await reconcileTunnelIntent(target, { ...overview, tunnels: [row] })).toBe(false);
  expect(await hasTunnelIntent(target)).toBe(false);
  await claimTunnelIntent(target, { id: "tunnel" });
  expect(await reconcileTunnelIntent(target, { ...overview, tunnels: [row] })).toBe(true);
  expect(await reconcileTunnelIntent(target, { ...overview, tunnels: [{ ...row, canStop: false, state: "stopped" }] })).toBe(false);
});
it("storage failure prevents a new intent, and corrupt pending records remain blocked", async () => {
  state.fail = true; await expect(claimTunnelIntent(target, input)).rejects.toThrow("Storage failed");
  state.fail = false; await claimTunnelIntent(target, input);
  for (const key of state.values.keys()) state.values.set(key, "corrupt");
  expect(await reconcileTunnelIntent(target, overview)).toBe(true);
  await clearTunnelIntent(target); expect(await hasTunnelIntent(target)).toBe(false);
});
