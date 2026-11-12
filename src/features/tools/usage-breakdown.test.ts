import { expect, it } from "vitest";
import { compactTokens, providerUsage, shortSessionId, tokenSplit, totalTokens } from "./usage-breakdown";
const base = { turns: 1, timedTurns: 0, durationMs: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, cost: null } as any;
it("sums reported tokens and keeps unknown separate from zero", () => {
  expect(totalTokens(base)).toBeNull();
  expect(totalTokens({ ...base, outputTokens: 0 })).toBe(0);
  expect(totalTokens({ ...base, inputTokens: 10, cacheReadTokens: 30 })).toBe(40);
});
it("splits only reported kinds into shares", () => {
  expect(tokenSplit({ ...base, inputTokens: 10, cacheReadTokens: 30 })).toEqual([
    { kind: "input", value: 10, share: 0.25 }, { kind: "cacheRead", value: 30, share: 0.75 },
  ]);
  expect(tokenSplit({ ...base, outputTokens: 0 })).toEqual([{ kind: "output", value: 0, share: 0 }]);
  expect(tokenSplit(base)).toEqual([]);
});
it("aggregates by provider, largest first, with unreported providers last", () => {
  const rows = [
    { ...base, sessionId: "a", provider: "codex", inputTokens: 100, turns: 2 },
    { ...base, sessionId: "b", provider: "claude", inputTokens: 300, outputTokens: 100 },
    { ...base, sessionId: "c", provider: "codex", outputTokens: 100 },
    { ...base, sessionId: "d", provider: "opencode", turns: 5 },
  ];
  const result = providerUsage(rows);
  expect(result.map((entry) => [entry.provider, entry.tokens, entry.sessions, entry.turns])).toEqual([
    ["claude", 400, 1, 1], ["codex", 200, 2, 3], ["opencode", null, 1, 5],
  ]);
  expect(result.map((entry) => entry.share)).toEqual([1, 0.5, 0]);
  expect(providerUsage([])).toEqual([]);
});
it("formats compact token readings", () => {
  expect([null, 0, 999, 1000, 1250, 99_950, 150_000, 3_400_000, 2_100_000_000].map(compactTokens)).toEqual(["—", "0", "999", "1K", "1.3K", "100K", "150K", "3.4M", "2.1B"]);
});
it("shortens session ids for secondary text and keeps short ids whole", () => {
  expect(shortSessionId("1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d")).toBe("1a2b3c4d");
  expect(shortSessionId("short")).toBe("short");
});
