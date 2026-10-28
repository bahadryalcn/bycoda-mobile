import { describe, expect, it } from "vitest";
import { parseWallTime, selectedWallTime, wallTimePickerDate } from "./time-field-model";

describe("host-local time selection", () => {
  it("accepts the HH:mm boundary range and rejects malformed or out-of-range input", () => {
    expect(parseWallTime("00:00")).toEqual({ hour: 0, minute: 0 });
    expect(parseWallTime("23:59")).toEqual({ hour: 23, minute: 59 });
    for (const value of ["24:00", "12:60", "9:00", "09:0", "-1:00", " 09:00", "09:00 ", "", "12:30:00"])
      expect(parseWallTime(value)).toBeUndefined();
  });

  it("preserves all 1440 wall-clock minutes through the native date carrier", () => {
    for (let minutes = 0; minutes < 1440; minutes++) {
      const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      expect(selectedWallTime("set", wallTimePickerDate(time))).toBe(time);
    }
    expect(selectedWallTime("set", wallTimePickerDate("invalid"))).toBe("09:00");
  });

  it("does not commit on cancellation, neutral action, missing selection or an invalid date", () => {
    const date = wallTimePickerDate("17:42");
    expect(selectedWallTime("dismissed", date)).toBeUndefined();
    expect(selectedWallTime("neutralButtonPressed", date)).toBeUndefined();
    expect(selectedWallTime("set")).toBeUndefined();
    expect(selectedWallTime("set", new Date(NaN))).toBeUndefined();
    expect(selectedWallTime("set", date)).toBe("17:42");
  });
});
