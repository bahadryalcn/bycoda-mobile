import { expect, it } from "vitest";
import { defaultNotificationSettings } from "../contracts";
import { channelEnabled, setChannel, withQuietHours } from "./notification-settings";

it("toggles one channel and keeps the rest", () => {
  const base = defaultNotificationSettings();
  expect(channelEnabled(base, "agent.finished", "push")).toBe(true);
  const off = setChannel(base, "agent.finished", "push", false);
  expect(channelEnabled(off, "agent.finished", "push")).toBe(false);
  expect(channelEnabled(off, "agent.finished", "os")).toBe(true);
  expect(off.preferences.filter((entry) => entry.event === "agent.finished" && entry.channel === "push")).toHaveLength(1);
});

it("never disables a mandatory event", () => {
  const next = setChannel(defaultNotificationSettings(), "account.new_device_sign_in", "in_app", false);
  expect(channelEnabled(next, "account.new_device_sign_in", "in_app")).toBe(true);
});

it("sets and clears quiet hours", () => {
  const set = withQuietHours(defaultNotificationSettings(), { start: "22:00", end: "07:00", timeZone: "Europe/Istanbul" });
  expect(set.quietHours?.start).toBe("22:00");
  expect(withQuietHours(set, null).quietHours).toBeNull();
});
