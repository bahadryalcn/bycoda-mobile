import { expect, it } from "vitest";
import { backoffMs, SessionReadSchedule, sessionReadSchedule, unsupportedSessionWait } from "./session-read-schedule";

it("waits for a known revision and backs off hosts that immediately return unchanged", () => {
  const policy = new SessionReadSchedule();
  expect(policy.waitMs(undefined, 0)).toBe(0);
  expect(policy.waitMs({ revision: 2 }, 0)).toBe(20_000);
  policy.observe({ revision: 2 }, { revision: 2 }, 20, 20_000, 0);
  expect(policy.delay(true, false, 100)).toBe(2_500);
  expect(policy.waitMs({ revision: 2 }, 100)).toBe(0);
  expect(policy.waitMs({ revision: 2 }, 60_000)).toBe(20_000);
});
it("keeps long-poll ownership after a wait or a real change and delays transient errors", () => {
  const policy = new SessionReadSchedule();
  policy.observe({ revision: 2 }, { revision: 3 }, 20, 20_000, 0);
  policy.observe({ revision: 3 }, { revision: 3 }, 20_000, 20_000, 20_000);
  expect(policy.delay(false, false, 20_000)).toBe(25);
  expect(policy.delay(false, true, 20_000)).toBe(7_500);
});
it("shares compatibility state across observers but resets when connection identity changes", () => {
  const query = {};
  const first = sessionReadSchedule(query, "host-A");
  first.observe({ revision: 1 }, { revision: 1 }, 10, 20_000, 0);
  const second = sessionReadSchedule(query, "host-A");
  expect(second).toBe(first);
  expect(second.waitMs({}, 100)).toBe(0);
  expect(sessionReadSchedule(query, "host-B").waitMs({}, 100)).toBe(20_000);
});
it("falls back only for an explicit wait parameter rejection, never lost authorization", () => {
  expect(unsupportedSessionWait(new Error("Unsupported waitMs parameter"))).toBe(true);
  expect(unsupportedSessionWait(Object.assign(new Error("Unsupported waitMs parameter"), { kind: "auth" }))).toBe(false);
  expect(unsupportedSessionWait(new Error("Unknown session"))).toBe(false);
  const schedule = new SessionReadSchedule(); schedule.rejectWait(100);
  expect(schedule.waitMs({}, 200)).toBe(0);
});
it("grows the error cadence per consecutive failure and caps it", () => {
  const policy = new SessionReadSchedule();
  expect(policy.delay(true, true, 0, 1)).toBe(2_500);
  expect(policy.delay(true, true, 0, 3)).toBe(10_000);
  expect(policy.delay(true, true, 0, 30)).toBe(30_000);
  expect(policy.delay(false, true, 0, 4)).toBe(30_000);
  expect(backoffMs(5_000, -1, 60_000)).toBe(5_000);
});
