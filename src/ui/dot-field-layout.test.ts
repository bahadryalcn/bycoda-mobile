import { expect, it } from "vitest";
import { DOT_SIZE, DOT_SPAN, dotLayout } from "./dot-field-layout";

it("lays out the same sparse field on every call", () => {
  const dots = dotLayout(402, 874);
  expect(dotLayout(402, 874)).toEqual(dots);
  const cells = Math.ceil((402 * DOT_SPAN) / 26) * Math.ceil(874 / 26);
  expect(dots.length).toBeGreaterThan(cells * 0.05);
  expect(dots.length).toBeLessThan(cells * 0.3);
});

it("keeps every dot inside the field and faint enough to stay behind the figure", () => {
  for (const dot of dotLayout(402, 874)) {
    expect(dot.x).toBeGreaterThanOrEqual(0);
    expect(dot.x + DOT_SIZE).toBeLessThanOrEqual(Math.ceil((402 * DOT_SPAN) / 26) * 26);
    expect(dot.level).toBeGreaterThanOrEqual(0.08);
    expect(dot.level).toBeLessThanOrEqual(0.68);
  }
});
