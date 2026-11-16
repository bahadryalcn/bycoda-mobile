import { expect, it } from "vitest";
import { sessionAttentionActions, sessionIsSnoozed, sessionSharePayload, sessionSnoozeTime } from "./session-attention-model";
import { projectSessionRows } from "./project-session-shelves";
import type { HostSessionSummary } from "./wire";

it("hides unsupported actions on older Hosts and accepts false/null feature fields", () => {
  expect(sessionAttentionActions({})).toEqual({ unread: false, snooze: false });
  expect(sessionAttentionActions({ unread: false, snoozedUntil: null })).toEqual({ unread: true, snooze: true });
});

it("calculates presets from a fixed phone-local clock, across day/month/year boundaries", () => {
  // Local constructors and local accessors keep the assertion valid in every test timezone.
  const now = new Date(2026, 11, 31, 17, 30, 0, 123).getTime();
  expect(sessionSnoozeTime("hour", now)).toBe(now + 3_600_000);
  expect(sessionSnoozeTime("evening", now)).toBe(new Date(2026, 11, 31, 18).getTime());
  expect(sessionSnoozeTime("evening", new Date(2026, 11, 31, 18).getTime())).toBe(new Date(2027, 0, 1, 18).getTime());
  expect(sessionSnoozeTime("tomorrow", now)).toBe(new Date(2027, 0, 1, 9).getTime());
  expect(sessionSnoozeTime("week", now)).toBe(new Date(2027, 0, 7, 9).getTime());
  const dst = new Date(2026, 2, 7, 12).getTime();
  expect(new Date(sessionSnoozeTime("tomorrow", dst)).getHours()).toBe(9);
  expect(new Date(sessionSnoozeTime("tomorrow", dst)).getDate()).toBe(8);
});

it("hides snoozed rows in a folded shelf, exposes wake time metadata and wakes at expiry", () => {
  const session = { id: "s", projectId: "p", status: "idle", snoozedUntil: 200 } as HostSessionSummary;
  expect(sessionIsSnoozed(session, 199)).toBe(true);
  expect(projectSessionRows([session], undefined, {}, {}, false, new Set(), false, { now: 199 }))
    .toEqual([{ kind: "header", key: "shelf:snoozed", shelf: "snoozed", count: 1, expanded: false }]);
  expect(projectSessionRows([session], undefined, {}, { snoozed: false }, false, new Set(), false, { now: 199 })).toHaveLength(2);
  expect(sessionIsSnoozed(session, 200)).toBe(false);
  expect(projectSessionRows([session], undefined, {}, {}, false, new Set(), false, { now: 200 })[0].kind).toBe("session");
});

it("shares the title and canonical copy link in a single native message", () => {
  expect(sessionSharePayload("My session", "bycoda://session/v1/host/h/s")).toEqual({
    title: "My session", message: "My session\nbycoda://session/v1/host/h/s",
  });
});
