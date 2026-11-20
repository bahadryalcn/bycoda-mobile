import { expect, it } from "vitest";
import { defaultNotificationSettings, type NotificationSettings, type QuietHours } from "../contracts";
import { withQuietHours } from "./notification-settings";
import { createNotificationSaves, type SaveControl, type SaveStore } from "./notification-saves";

const details: SaveControl<boolean> = {
  id: "details",
  read: (settings) => settings.pushShowDetails,
  write: (settings, value) => ({ ...settings, pushShowDetails: value }),
};
const quiet: SaveControl<QuietHours | null> = { id: "quietHours", read: (settings) => settings.quietHours ?? null, write: withQuietHours };
const window: QuietHours = { start: "22:00", end: "07:00", timeZone: "Europe/Istanbul" };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeStore(initial: NotificationSettings) {
  let shown = initial;
  const marks = new Map<string, () => void>();
  const pending = new Map<string, number>();
  const store: SaveStore = {
    current: () => shown,
    show: (settings) => {
      shown = settings;
    },
    track: (id, delta) => pending.set(id, (pending.get(id) ?? 0) + delta),
    mark: (id, retry) => {
      if (retry) marks.set(id, retry);
      else marks.delete(id);
    },
  };
  return { store, marks, pending, get shown() { return shown; } };
}

it("shows the change at once and sends it on top of the confirmed copy", async () => {
  const base = defaultNotificationSettings();
  const fake = fakeStore(base);
  const saves = createNotificationSaves(fake.store);
  const bodies: NotificationSettings[] = [];
  saves.adopt(base);
  saves.save(details, true, async (body) => {
    bodies.push(body);
    return body;
  });
  expect(fake.shown.pushShowDetails).toBe(true);
  await flush();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]!.pushShowDetails).toBe(true);
  expect(fake.pending.get("details")).toBe(0);
  expect(fake.marks.has("details")).toBe(false);
});

it("reverts only the failed control and retries it on demand", async () => {
  const base = defaultNotificationSettings();
  const fake = fakeStore(base);
  const saves = createNotificationSaves(fake.store);
  let online = false;
  const put = async (body: NotificationSettings) => {
    if (!online) throw new Error("offline");
    return body;
  };
  saves.adopt(base);
  saves.save(details, true, put);
  await flush();
  expect(fake.shown.pushShowDetails).toBe(base.pushShowDetails);
  expect(fake.marks.has("details")).toBe(true);

  online = true;
  fake.marks.get("details")!();
  await flush();
  expect(fake.shown.pushShowDetails).toBe(true);
  expect(fake.marks.has("details")).toBe(false);
});

it("keeps a later success and never resends a failed control's value", async () => {
  const base = defaultNotificationSettings();
  const fake = fakeStore(base);
  const saves = createNotificationSaves(fake.store);
  const bodies: NotificationSettings[] = [];
  const put = async (body: NotificationSettings) => {
    bodies.push(body);
    if (body.pushShowDetails) throw new Error("rejected");
    return body;
  };
  saves.adopt(base);
  saves.save(details, true, put);
  saves.save(quiet, window, put);
  await flush();
  expect(fake.shown.pushShowDetails).toBe(base.pushShowDetails);
  expect(fake.shown.quietHours).toEqual(window);
  expect(fake.marks.has("details")).toBe(true);
  expect(fake.marks.has("quietHours")).toBe(false);
  expect(bodies.at(-1)!.pushShowDetails).toBe(base.pushShowDetails);
});
