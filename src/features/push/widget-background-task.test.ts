import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ values: new Map<string, string>(), publish: vi.fn(), activity: vi.fn(), define: vi.fn(), register: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: async (key: string) => f.values.get(key) ?? null,
  setItem: async (key: string, value: string) => { f.values.set(key, value); },
} }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => ({}) }));
vi.mock("expo-task-manager", () => ({ defineTask: f.define }));
vi.mock("expo-notifications", () => ({ registerTaskAsync: f.register.mockResolvedValue(null), BackgroundNotificationTaskResult: { NewData: 0, NoData: 1, Failed: 2 } }));
vi.mock("../widgets/platform/publish", () => ({ publishWidgetSnapshot: f.publish }));
vi.mock("../widgets/platform/live-activity", () => ({ syncSessionActivity: f.activity }));
import { readFileSync } from "node:fs";
import { widgetTaskData } from "./widget-background-task";
import { receiveWidgetPush } from "./widget-push-handler";
import { buildWidgetSnapshot } from "../widgets/model/snapshot";
import { widgetPalette } from "../widgets/model/palette";
import { widgetLabels } from "../widgets/model/widget-labels";
import { WIDGET_CACHE_KEY } from "../widgets/model/background-snapshot";
import { revokeWidgetCache } from "../widgets/platform/widget-cache";

let push: Record<string, string>;
beforeEach(() => {
  f.values.clear(); f.publish.mockReset(); f.activity.mockReset();
  const now = Date.now(); const sessions = [{ id: "s", projectId: "p", projectName: "Project", title: "Opted in", status: "running" as const, updatedAt: now - 1000 }];
  const snapshot = buildWidgetSnapshot({ machine: { id: "m", name: "PC" }, unlocked: true, ready: true, sessions, showTitles: true, now,
    labels: widgetLabels((_tr, en) => en), palette: widgetPalette })!;
  f.values.set(WIDGET_CACHE_KEY, JSON.stringify({ environmentId: "env", machineId: "m", machineName: "PC", backgroundAllowed: true,
    showTitles: true, showQuestionText: true, snapshot, sessions, lastPushAt: now - 1000 }));
  f.values.set("bycoda.mobile.remote-machines.v1", JSON.stringify({ activeId: "m", machines: [{ id: "m", environmentId: "env" }] }));
  f.values.set("bycoda.mobile.widgets.v1", JSON.stringify({ showTitles: true, showQuestionText: false }));
  push = { kind: "widget", environmentId: "env", widget: JSON.stringify({ v: 1, at: now, complete: true, sessions: [{ id: "s", projectId: "p", kind: "question", status: "running", updatedAt: now }] }) };
});
it("keeps the entry-evaluated task shell free of widget publishing imports", () => {
  // Regression for #1296: index.ts evaluates this module before the router, so its static imports stay minimal.
  const source = readFileSync(new URL("./widget-background-task.ts", import.meta.url), "utf8");
  const staticImports = [...source.matchAll(/^import (?!type )[^;]*?from "([^"]+)"/gm)].map(m => m[1]);
  // The task manager is the only native module it needs synchronously: defineTask must run during evaluation.
  expect(staticImports).toEqual(["expo", "expo-task-manager"]);
});
it("registers a module-scope task and decodes headless envelopes", async () => {
  vi.stubEnv("EXPO_OS", "android");
  vi.resetModules();
  const registration = (await import("./widget-background-task")).widgetTaskRegistration;
  // Defined while the module evaluates, before any await: a headless launch needs it at once.
  expect(f.define).toHaveBeenCalledWith("bycoda-widget-push-v1", expect.any(Function));
  await registration;
  expect(f.register).toHaveBeenCalledWith("bycoda-widget-push-v1");
  expect(widgetTaskData({ notification: null, data: { dataString: JSON.stringify(push) } })).toEqual(push);
  expect(widgetTaskData({ notification: null, data: { dataString: "{" } })).toBeNull();
});
it("publishes cached content and updates only an already-running Live Activity", async () => {
  expect(await receiveWidgetPush(push)).toBe(true);
  expect(f.publish.mock.calls[0][0].sessions[0]).toMatchObject({ title: "Opted in", kind: "question", detail: "Waiting for your answer" });
  expect(f.activity).toHaveBeenCalledWith(expect.any(Object), true);
});
it("honors persisted opt-outs and never switches or re-adds an unpaired computer", async () => {
  f.values.set("bycoda.mobile.widgets.v1", JSON.stringify({ showTitles: false }));
  await receiveWidgetPush(push); expect(f.publish.mock.calls[0][0].sessions[0].title).toBe("");
  f.publish.mockClear();
  f.values.set("bycoda.mobile.remote-machines.v1", JSON.stringify({ activeId: "other", machines: [] }));
  expect(await receiveWidgetPush(push)).toBe(false); expect(f.publish).not.toHaveBeenCalled();
});
it("lock/account revocation clears persisted sessions and cannot be undone by a later push", async () => {
  await revokeWidgetCache(); f.publish.mockClear();
  await receiveWidgetPush(push);
  // The locked timeline revocation published is still current, so the push need not republish it.
  for (const [snapshot] of f.publish.mock.calls) expect(snapshot).toMatchObject({ state: "locked", sessions: [] });
  expect(JSON.parse(f.values.get(WIDGET_CACHE_KEY)!).snapshot).toMatchObject({ state: "locked", sessions: [], counts: { running: 0, needsInput: 0, failed: 0 } });
});
it("a heartbeat that changes nothing visible keeps the fresh timeline and reports no data", async () => {
  expect(await receiveWidgetPush(push)).toBe(true); f.publish.mockClear(); f.activity.mockClear();
  const before = JSON.parse(f.values.get(WIDGET_CACHE_KEY)!);
  const update = JSON.parse(push.widget);
  const heartbeat = { ...push, widget: JSON.stringify({ ...update, at: update.at + 60_000 }) };
  expect(await receiveWidgetPush(heartbeat)).toBe(false);
  expect(f.publish).not.toHaveBeenCalled(); expect(f.activity).not.toHaveBeenCalled();
  const after = JSON.parse(f.values.get(WIDGET_CACHE_KEY)!);
  expect(after.lastPushAt).toBe(update.at + 60_000); expect(after.snapshot).toEqual(before.snapshot);
});
it("republishes an unchanged heartbeat once the published timeline is past half its lifetime", async () => {
  const cache = JSON.parse(f.values.get(WIDGET_CACHE_KEY)!);
  const update = JSON.parse(push.widget);
  cache.snapshot.expiresAt = Date.now() + 4 * 60_000;
  f.values.set(WIDGET_CACHE_KEY, JSON.stringify(cache));
  expect(await receiveWidgetPush({ ...push, widget: JSON.stringify({ ...update, sessions: [{ ...update.sessions[0], kind: "running" }] }) })).toBe(true);
  expect(f.publish).toHaveBeenCalledTimes(1);
});
it("disabled pushes prevent publication", async () => {
  f.values.set("bycoda.mobile.push.v1", JSON.stringify({ enabled: false }));
  expect(await receiveWidgetPush(push)).toBe(false); expect(f.publish).not.toHaveBeenCalled();
});
