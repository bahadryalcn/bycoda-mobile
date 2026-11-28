import { describe, expect, it } from "vitest";
import {
  evaluateFailedTurn,
  failedTurnRetry,
  retryCommand,
  usageLimitFailureId,
  type RetrySession,
} from "./failed-turn-retry";
import type { Block } from "./wire";

const block = (id: string, role: Block["role"], text: string, extra: Partial<Block> = {}) =>
  ({ id, role, text, ...extra }) as Block;
const failure = (id: string, text = "Provider crashed") => block(id, "system", text, { notice: "error" });
const file = { id: "a1", name: "shot.png", mimeType: "image/png", kind: "image" as const, size: 10 };
const session = (blocks: Block[], extra: Partial<RetrySession> = {}, inner: Partial<RetrySession["session"]> = {}) =>
  ({ status: "idle", authorityGeneration: 3, ...extra, session: { id: "s1", blocks, ...inner } }) as RetrySession;

describe("failed turn retry", () => {
  it("resends the last prompt with its attachments and intent", () => {
    const value = session([
      block("u0", "user", "older"),
      block("a0", "assistant", "done"),
      block("u1", "user", "fix it", { attachments: [{ ...file, path: "/x" }], intent: "plan" }),
      block("t1", "tool", ""),
      failure("e1"),
    ]);
    expect(evaluateFailedTurn(value)).toEqual({
      retry: { errorId: "e1", text: "fix it", attachments: [file], intent: "plan" },
    });
  });

  it("joins a prompt with the steers sent during its turn", () => {
    const value = session([
      block("u1", "user", "first"),
      block("u2", "user", "also this", { continuationOf: "u1" }),
      failure("e1"),
    ]);
    expect(failedTurnRetry(value)?.text).toBe("first\n\nalso this");
  });

  it("is not offered while a turn runs, is queued, drafted or waits on the owner", () => {
    const blocks = [block("u1", "user", "go"), failure("e1")];
    expect(failedTurnRetry(session(blocks, { status: "running" }))).toBeNull();
    expect(failedTurnRetry(session(blocks), { queued: true })).toBeNull();
    expect(failedTurnRetry(session([...blocks, block("d1", "user", "later", { draft: true })]))).toBeNull();
    expect(failedTurnRetry(session(blocks, {}, { usageLimit: { resetsAt: 1 } }))).toBeNull();
    expect(failedTurnRetry(session(blocks, { historyLoading: true }))).toBeNull();
    expect(failedTurnRetry(session([block("u1", "user", "go"), failure("e1"), block("a1", "assistant", "recovered")]))).toBeNull();
    expect(failedTurnRetry(session([block("u1", "user", "go"), block("a1", "assistant", "fine")]))).toBeNull();
  });

  it("leaves a usage limit to its own recovery", () => {
    const value = session([block("u1", "user", "go"), failure("e1", "You've hit your limit · resets 3pm")]);
    expect(evaluateFailedTurn(value)).toBeNull();
  });

  it("never resends a truncated preview or content it cannot rebuild", () => {
    const long = block("u1", "user", "cut…", { remoteContent: { bytes: 40_000 } as Block["remoteContent"] });
    expect(evaluateFailedTurn(session([long, failure("e1")]))).toEqual({ blocked: "truncated", errorId: "e1" });
    expect(evaluateFailedTurn(session([block("u1", "user", "/bycoda do"), failure("e1")]))).toEqual({ blocked: "unsupported", errorId: "e1" });
    expect(evaluateFailedTurn(session([block("u1", "user", "x", { intent: "orchestrate" }), failure("e1")]))).toEqual({ blocked: "unsupported", errorId: "e1" });
    // The Host records a compaction as the literal "/compact"; as a prompt it would not compact.
    expect(evaluateFailedTurn(session([block("u1", "user", "/compact"), failure("e1")]))).toEqual({ blocked: "unsupported", errorId: "e1" });
    expect(
      evaluateFailedTurn(session([block("u1", "user", "x", { attachments: [{ ...file, missing: true }] }), failure("e1")])),
    ).toEqual({ blocked: "attachments-missing", errorId: "e1" });
    expect(evaluateFailedTurn(session([block("u1", "user", "x"), failure("e1", "Message not sent: offline")]))).toEqual({
      blocked: "not-sent",
      errorId: "e1",
    });
  });

  it("builds an ordinary send under the displayed authority", () => {
    const value = session([block("u1", "user", "/draft is literal"), failure("e1")]);
    const retry = failedTurnRetry(value)!;
    expect(retryCommand(value, retry)).toEqual({
      type: "send",
      authorityGeneration: 3,
      sessionId: "s1",
      text: "/draft is literal",
      attachments: [],
    });
    expect(() => retryCommand({ ...value, status: "running" }, retry)).toThrow();
  });
});

describe("usage limit failure", () => {
  it("belongs only to the last failed turn", () => {
    const limited = failure("e1", "Usage limit reached · resets 3pm");
    expect(usageLimitFailureId([block("u1", "user", "go"), limited])).toBe("e1");
    expect(usageLimitFailureId([block("u1", "user", "go"), limited, block("u2", "user", "again")])).toBeUndefined();
    expect(usageLimitFailureId([block("u1", "user", "go"), failure("e2")])).toBeUndefined();
  });
});
