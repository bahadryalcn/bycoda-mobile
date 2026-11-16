import { expect, it, vi } from "vitest";
import { defaultNotificationSettings, type AccountClient } from "../contracts";
import { channelEnabled, setChannel } from "./notification-settings";
import { reconcileHostCanonical, syncHostCanonical, type HostCanonicalStore } from "./push-host-canonical";

it("turns agent push off while the Host is active and keeps account events", () => {
  const result = reconcileHostCanonical(defaultNotificationSettings(), true, null)!;
  for (const event of ["agent.finished", "agent.failed", "approval.pending"] as const) expect(channelEnabled(result.settings, event, "push")).toBe(false);
  expect(channelEnabled(result.settings, "agent.finished", "os")).toBe(true);
  expect(channelEnabled(result.settings, "account.new_device_sign_in", "in_app")).toBe(true);
  expect(reconcileHostCanonical(result.settings, true, result.saved)).toBeNull();
});

it("restores only what it turned off, and respects a user's own off choice", () => {
  const user = setChannel(defaultNotificationSettings(), "agent.failed", "push", false);
  const on = reconcileHostCanonical(user, true, null)!;
  expect(on.saved).toEqual({ "agent.finished": true, "approval.pending": true });
  const off = reconcileHostCanonical(on.settings, false, on.saved)!;
  expect(channelEnabled(off.settings, "agent.finished", "push")).toBe(true);
  expect(channelEnabled(off.settings, "agent.failed", "push")).toBe(false);
  expect(off.saved).toBeNull();
});

it("writes through the client and the store, and does nothing when idle", async () => {
  let held: Awaited<ReturnType<HostCanonicalStore["read"]>> = null;
  const store: HostCanonicalStore = { read: async () => held, write: async (value) => { held = value; } };
  const put = vi.fn(async ({ body }) => body);
  const get = vi.fn(async () => defaultNotificationSettings());
  const client = { getNotificationSettings: get, putNotificationSettings: put } as unknown as AccountClient;
  await syncHostCanonical(client, false, store);
  expect(get).not.toHaveBeenCalled();
  await syncHostCanonical(client, true, store);
  expect(put).toHaveBeenCalledTimes(1);
  expect(held).not.toBeNull();
  get.mockResolvedValue(put.mock.calls[0]![0].body);
  await syncHostCanonical(client, false, store);
  expect(put).toHaveBeenCalledTimes(2);
  expect(held).toBeNull();
});
