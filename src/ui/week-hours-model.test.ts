import { describe, expect, it } from "vitest";
import { weekRunBlocks, wallTimeHours, windowBlocks } from "./week-hours-model";

describe("week hours mapping", () => {
  it("parses wall times strictly", () => {
    expect(wallTimeHours("09:30")).toBe(9.5);
    for (const v of ["", "9:30", "24:00", "12:60"]) expect(wallTimeHours(v)).toBeUndefined();
  });
  it("splits overnight windows and drops empty ones", () => {
    expect(windowBlocks("09:00", "17:00")).toEqual([{ start: 9, end: 17 }]);
    expect(windowBlocks("22:00", "07:00")).toEqual([{ start: 22, end: 24 }, { start: 0, end: 7 }]);
    expect(windowBlocks("22:00", "00:00")).toEqual([{ start: 22, end: 24 }]);
    expect(windowBlocks("08:00", "08:00")).toEqual([]);
    expect(windowBlocks("bad", "07:00")).toEqual([]);
  });
  it("places weekly, weekday and daily runs on the right days", () => {
    const base = { time: "09:30", minute: 0, dayOfWeek: 3 };
    const weekly = weekRunBlocks({ ...base, scheduleKind: "weekly" });
    expect(weekly.map((d) => d.length)).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(weekly[3]).toEqual([{ start: 9.5, end: 10 }]);
    expect(weekRunBlocks({ ...base, scheduleKind: "weekdays" }).map((d) => d.length)).toEqual([0, 1, 1, 1, 1, 1, 0]);
    expect(weekRunBlocks({ ...base, scheduleKind: "daily" }).every((d) => d.length === 1)).toBe(true);
  });
  it("clips a late run at midnight and handles hourly and invalid input", () => {
    expect(weekRunBlocks({ scheduleKind: "daily", time: "23:59", minute: 0, dayOfWeek: 0 })[0]).toEqual([{ start: 23 + 59 / 60, end: 24 }]);
    const hourly = weekRunBlocks({ scheduleKind: "hourly", time: "", minute: 15, dayOfWeek: 0 });
    expect(hourly[0]).toHaveLength(24);
    expect(hourly[0][1].start).toBe(1.25);
    expect(weekRunBlocks({ scheduleKind: "hourly", time: "", minute: 60, dayOfWeek: 0 }).flat()).toEqual([]);
    expect(weekRunBlocks({ scheduleKind: "daily", time: "xx", minute: 0, dayOfWeek: 0 }).flat()).toEqual([]);
    expect(weekRunBlocks({ scheduleKind: "weekly", time: "10:00", minute: 0, dayOfWeek: 9 }).flat()).toEqual([]);
  });
});
