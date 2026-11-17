import { describe, expect, it, vi } from "vitest";
import { askSideQuestion } from "./side-chat-client";
import { canAskSideQuestion, parseSideAnswer, sideChatHistory, type SideChatMessage } from "./side-chat-model";

const message = (index: number): SideChatMessage => ({ id: String(index), role: index % 2 ? "assistant" : "user", text: `m${index}` });

describe("side chat model", () => {
  it("allows only non-empty questions within the limit while idle", () => {
    expect(canAskSideQuestion("  ", false)).toBe(false);
    expect(canAskSideQuestion("hi", true)).toBe(false);
    expect(canAskSideQuestion("hi", false)).toBe(true);
    expect(canAskSideQuestion("x".repeat(4001), false)).toBe(false);
  });

  it("keeps the newest 20 messages as history", () => {
    const history = sideChatHistory(Array.from({ length: 30 }, (_, index) => message(index)));
    expect(history).toHaveLength(20);
    expect(history[0]).toEqual({ role: "user", text: "m10" });
  });

  it("rejects an unexpected answer shape", () => {
    expect(parseSideAnswer({ answer: "ok" })).toBe("ok");
    expect(parseSideAnswer({ answer: " " })).toBeNull();
    expect(parseSideAnswer(null)).toBeNull();
  });
});

describe("askSideQuestion", () => {
  it("sends one unretried request and returns the answer", async () => {
    const request = vi.fn(async () => ({ answer: "Because" }));
    await expect(askSideQuestion({ request }, { sessionId: "s", question: "Why?", history: [message(0)] })).resolves.toBe("Because");
    expect(request).toHaveBeenCalledWith(
      "sessions.sideQuestion",
      { sessionId: "s", question: "Why?", history: [{ role: "user", text: "m0" }] },
      { retry: false, signal: undefined, timeoutMs: 150_000 },
    );
  });

  it("throws on a malformed reply", async () => {
    await expect(askSideQuestion({ request: async () => ({}) }, { sessionId: "s", question: "Q", history: [] })).rejects.toThrow(/unreadable/);
  });
});
