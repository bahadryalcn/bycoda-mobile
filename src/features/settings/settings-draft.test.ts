import { describe, expect, it } from "vitest";
import { acknowledgeSettingsDraft, readHostSettingsState, settingsFields, validSettingsFields } from "./settings-draft";

describe("host settings draft snapshots", () => {
  it("derives a clean form from the current server values", () => {
    expect(settingsFields({ maxRunningTasks: 2, dailyAgentMinutes: 120 })).toEqual({
      maxRunning: "2",
      dailyMinutes: "120",
    });
    expect(settingsFields({ maxRunningTasks: 3, dailyAgentMinutes: 0 })).toEqual({
      maxRunning: "3",
      dailyMinutes: "0",
    });
  });
  it("clears only the submitted draft after an acknowledgement", () => {
    const submitted = { maxRunning: "3", dailyMinutes: "120" };
    expect(acknowledgeSettingsDraft({ override: submitted }, submitted)).toEqual({
      override: null,
    });
    const edited = { override: { maxRunning: "4", dailyMinutes: "120" } };
    expect(acknowledgeSettingsDraft(edited, submitted)).toBe(edited);
    const editedBack = { override: { ...submitted } };
    expect(acknowledgeSettingsDraft(editedBack, submitted)).toBe(editedBack);
  });
  it("validates task concurrency and whole nonnegative minute limits", () => {
    for (const count of [1, 9, 99, Number.MAX_SAFE_INTEGER])
      expect(validSettingsFields({ maxRunning: String(count), dailyMinutes: "0" })).toBe(true);
    for (const values of [
      { maxRunning: "", dailyMinutes: "10" },
      { maxRunning: String(Number.MAX_SAFE_INTEGER + 1), dailyMinutes: "10" },
      { maxRunning: "0", dailyMinutes: "10" },
      { maxRunning: "1.5", dailyMinutes: "10" },
      { maxRunning: "2", dailyMinutes: "-1" },
      { maxRunning: "2", dailyMinutes: "1.5" },
    ])
      expect(validSettingsFields(values)).toBe(false);
  });
});

it("accepts bounded host settings and rejects malformed numeric or usage data", () => {
  const valid = { maxRunningTasks: 2, dailyAgentMinutes: 0, usedMinutes: 42.5, limitReached: false };
  expect(readHostSettingsState(valid)).toEqual(valid);
  for (const maxRunningTasks of [9, 99, Number.MAX_SAFE_INTEGER])
    expect(readHostSettingsState({ ...valid, maxRunningTasks }).maxRunningTasks).toBe(maxRunningTasks);
  for (const value of [null, { ...valid, maxRunningTasks: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, dailyAgentMinutes: -1 }, { ...valid, usedMinutes: NaN }, { ...valid, usedMinutes: "42" }, { ...valid, limitReached: "false" }]) expect(() => readHostSettingsState(value)).toThrow("Invalid computer task settings");
  for (const input of ["1e0", " 1", "+1"]) expect(validSettingsFields({ maxRunning: input, dailyMinutes: "0" })).toBe(false);
});
