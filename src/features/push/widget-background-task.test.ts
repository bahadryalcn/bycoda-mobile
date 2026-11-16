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
import { receiveWidgetPush, widgetTaskData } from "./widget-background-task";
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
it("registers a module-scope task and decodes headless envelopes", async () => {
  vi.stubEnv("EXPO_OS", "android");
  vi.resetModules();
  await (await import("./widget-background-task")).widgetTaskRegistration;
  expect(f.define).toHaveBeenCalledWith("bycoda-widget-push-v1", expect.any(Function));
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
  expect(f.publish.mock.calls[0][0]).toMatchObject({ state: "locked", sessions: [], counts: { running: 0, needsInput: 0, failed: 0 } });
});
it("disabled pushes prevent publication", async () => {
  f.values.set("bycoda.mobile.push.v1", JSON.stringify({ enabled: false }));
  expect(await receiveWidgetPush(push)).toBe(false); expect(f.publish).not.toHaveBeenCalled();
});
