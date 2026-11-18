import { expect, it } from "vitest";
import {
  composerContextReading,
  contextTokensLabel,
  contextTone,
  formatContextApiTime,
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

it("reads response speed and API time like the desktop panel", () => {
  const reading = composerContextReading(
    session(
      { context: { used: 10, window: 100 }, usage: { costUsd: 1, apiMs: 65_000 } },
      [{ id: "u", role: "user", durationMs: 4000, turnMetrics: { outputTokens: 200 } }],
    ),
  )!;
  expect(reading.tps).toBe(50);
  expect(reading.apiMs).toBe(65_000);
  expect(formatContextApiTime(65_000)).toBe("1m 5s");
  expect(composerContextReading(session({ context: { used: 1 } }))!.tps).toBeUndefined();
});

it("lists subagents with their last reported context level", () => {
  const reading = composerContextReading(
    session({ context: { used: 10, window: 100 } }, [
      { id: "a", role: "tool", text: "Agent", agentRun: { name: "Fix tests" }, tool: { kind: "agent", callId: "c1", title: "Agent: Fix tests", agentContext: { used: 50, window: 100 } } },
      { id: "b", role: "tool", text: "Agent", agentRun: { name: "Fix tests" }, tool: { kind: "agent", callId: "c1", title: "Agent: Fix tests" } },
    ]),
  )!;
  expect(reading.agents).toHaveLength(1);
  expect(reading.agents![0]).toMatchObject({ used: 50, ratio: 0.5 });
});
