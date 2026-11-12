import { expect, it } from "vitest";
import { gibibyteLabel, shareOf, uptimeLabel } from "./diagnostics-format";

const units = { hours: "h", minutes: "min" };

it("formats memory in GB with one decimal and shares without a denominator as unknown", () => {
  expect(gibibyteLabel(1024 ** 3 * 37.44)).toBe("37.4 GB");
  expect(shareOf(25, 100)).toBe(25);
  expect(shareOf(200, 100)).toBe(100);
  expect(shareOf(1, 0)).toBeNull();
});

it("formats uptime in hours and minutes, dropping the hour part under one hour", () => {
  expect(uptimeLabel(2 * 3600 + 36 * 60 + 40, units)).toBe("2 h 36 min");
  expect(uptimeLabel(42 * 60, units)).toBe("42 min");
  expect(uptimeLabel(0, units)).toBe("0 min");
});
