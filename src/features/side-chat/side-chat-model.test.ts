import { describe, expect, it, vi } from "vitest";
import { askSideQuestion } from "./side-chat-client";
import { isUserDraftKey } from "@/state/local-draft-storage";
import {
  canAskSideQuestion,
  decodeSideChatThread,
  encodeSideChatThread,
  parseSideAnswer,
  sideChatKey,
  sideChatHistory,
  sideChatOutOfContextCount,
  type SideChatMessage,
} from "./side-chat-model";

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

describe("side chat thread persistence", () => {
  it("scopes a thread by computer and session and is owned by the saved-draft cleanup", () => {
    const key = sideChatKey("machine-a", "session-1");
    expect(key).not.toBe(sideChatKey("machine-b", "session-1"));
    expect(key).not.toBe(sideChatKey("machine-a", "session-2"));
    expect(isUserDraftKey(key)).toBe(true);
  });

  it("round-trips messages and the unsent draft, and keeps an empty thread out of storage", () => {
    const thread = { messages: [message(0), message(1)], draft: "next" };
    expect(decodeSideChatThread(encodeSideChatThread(thread)!)).toEqual(thread);
    expect(encodeSideChatThread({ messages: [], draft: "" })).toBeNull();
    expect(encodeSideChatThread(null)).toBeNull();
  });

  it("rejects an unreadable stored thread instead of treating it as empty", () => {
    expect(() => decodeSideChatThread("not a thread")).toThrow();
    expect(() => decodeSideChatThread(`bycoda-side-chat-v1:\n${JSON.stringify({ messages: [{ id: 1 }], draft: "" })}`)).toThrow();
  });

  it("counts the earlier messages the next question no longer sends", () => {
    expect(sideChatOutOfContextCount(Array.from({ length: 20 }, (_, index) => message(index)))).toBe(0);
    expect(sideChatOutOfContextCount(Array.from({ length: 23 }, (_, index) => message(index)))).toBe(3);
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
