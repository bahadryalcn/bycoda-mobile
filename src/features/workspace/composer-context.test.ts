import { expect, it } from "vitest";
import {
  composerContextReading,
  contextTokensLabel,
  contextTone,
  formatContextCost,
  formatContextTokens,
} from "./composer-context";
import type { HostSession } from "./wire";

const session = (fields: Record<string, unknown>, blocks: unknown[] = [{ id: "b" }]) =>
  ({ session: { blocks, ...fields } }) as unknown as HostSession;

it("reads the synchronized context level and window like the desktop meter", () => {
  const reading = composerContextReading(
    session({ context: { used: 176_000, window: 256_000 }, usage: { costUsd: 0.004 } }),
  )!;
  expect(Math.round(reading.ratio! * 100)).toBe(69);
  expect(contextTokensLabel(reading)).toBe("176K / 256K");
  expect(formatContextCost(reading.costUsd!)).toBe("<$0.01");
  expect(contextTone(reading.ratio)).toBe("normal");
});

it("keeps the level with an unknown window and invents no capacity", () => {
  const reading = composerContextReading(session({ context: { used: 1500 } }))!;
  expect(reading.ratio).toBeNull();
  expect(contextTokensLabel(reading)).toBe("1.5K");
});

it("shows an empty ring only for a conversation with no messages or usage", () => {
  expect(composerContextReading(session({}, []))).toEqual({ ratio: 0, empty: true });
  expect(composerContextReading(session({}))).toBeNull();
  expect(composerContextReading(undefined)).toBeNull();
});

it("uses desktop thresholds and token formatting", () => {
  expect(contextTone(0.75)).toBe("warning");
  expect(contextTone(0.9)).toBe("danger");
  expect(contextTone(1.2)).toBe("danger");
  expect(formatContextTokens(950)).toBe("950");
  expect(formatContextTokens(1_500_000)).toBe("1.5M");
  expect(formatContextTokens(-1)).toBe("0");
});
