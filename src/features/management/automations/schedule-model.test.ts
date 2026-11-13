import { describe, expect, it } from "vitest";
import { automationTriggerValid, integerInRange, scheduleLabel, scheduleSentence, validScheduleTime } from "./schedule-model";

describe("mobile automation schedules", () => {
  it("validates continuous bounds and keeps events independent of hidden schedule input", () => {
    for (const gap of ["1", "10080"]) expect(automationTriggerValid("continuous", gap, false)).toBe(true);
    for (const gap of ["0", "10081", "", "1.5"]) expect(automationTriggerValid("continuous", gap, true)).toBe(false);
    expect(automationTriggerValid("event", "", false)).toBe(true);
    expect(automationTriggerValid("scheduled", "1", false)).toBe(false);
  });
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

  it("describes each schedule as a sentence", () => {
    const copy = (_tr: string, en: string, values: Record<string, string | number> = {}) =>
      en.replace(/\{(p\d)\}/g, (_m, key: string) => String(values[key]));
    const item = { scheduleKind: "weekdays" as const, time: "09:00", minute: 15, dayOfWeek: 1 };
    expect(scheduleSentence(item, copy)).toBe("Every weekday at 09:00");
    expect(scheduleSentence({ ...item, scheduleKind: "daily" }, copy)).toBe("Every day at 09:00");
    expect(scheduleSentence({ ...item, scheduleKind: "weekly" }, copy)).toBe("Every Monday at 09:00");
    expect(scheduleSentence({ ...item, scheduleKind: "hourly" }, copy)).toBe("Every hour at minute 15");
  });
});
