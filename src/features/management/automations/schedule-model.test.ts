import { describe, expect, it } from "vitest";
import { integerInRange, scheduleLabel, validScheduleTime } from "./schedule-model";

describe("mobile automation schedules", () => {
  it("rejects partial and out-of-range times without changing user input", () => {
    for (const value of ["", "9:00", "24:00", "12:60", "-1:20", "12:00 "])
      expect(validScheduleTime(value)).toBe(false);
    for (const value of ["00:00", "09:05", "23:59"])
      expect(validScheduleTime(value)).toBe(true);
    expect(integerInRange("59", 0, 59)).toBe(true);
    for (const value of ["60", "-1", "1.5", "1e1", "", " 1"])
      expect(integerInRange(value, 0, 59)).toBe(false);
  });

  it("distinguishes weekdays from a particular weekly day", () => {
    const copy = (_tr: string, en: string) => en;
    const item = { scheduleKind: "weekdays" as const, time: "09:30", minute: 5, dayOfWeek: 1 };
    expect(scheduleLabel(item, copy)).toBe("Weekdays · 09:30");
    expect(scheduleLabel({ ...item, scheduleKind: "weekly" }, copy)).toBe("Monday · 09:30");
    expect(scheduleLabel({ ...item, scheduleKind: "hourly" }, copy)).toBe("Hourly · :05");
  });
});
