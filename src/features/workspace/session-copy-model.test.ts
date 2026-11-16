import { expect, it } from "vitest";
import type { Block } from "./wire";
import { conversationText, MAX_CONVERSATION_TEXT, sessionCopyLink } from "./session-copy-model";
import { parseSessionReference } from "./session-reference";

const block = (role: Block["role"], text: string, extra: Partial<Block> = {}): Block => ({ id: role, role, text, ...extra });
it("copies only public committed user/assistant text in source order", () => {
  expect(conversationText([
    block("user", " hello "), block("tool", "secret tool"), block("reasoning", "secret reasoning"),
    block("assistant", "answer"), block("user", "draft", { draft: true }),
    block("assistant", "internal", { internal: true }), block("assistant", "  "),
  ])).toBe("User:  hello \n\nAssistant: answer");
});
it("rejects empty, truncated and oversized conversations", () => {
  expect(() => conversationText([])).toThrow("No conversation text");
  expect(() => conversationText([block("assistant", "preview", { remoteContent: { revision: 1, bytes: 100 } })])).toThrow("incomplete");
  expect(() => conversationText([block("user", "x".repeat(MAX_CONVERSATION_TEXT))])).toThrow("limit");
  expect(conversationText([block("user", "x".repeat(MAX_CONVERSATION_TEXT - 6))])).toHaveLength(MAX_CONVERSATION_TEXT);
});
it("builds canonical app links with the actual Host identity", () => {
  const link = sessionCopyLink("host/one", "session.*");
  expect(parseSessionReference(link!)).toEqual({ locator: { kind: "host", environmentId: "host/one", sessionId: "session.*" } });
  expect(sessionCopyLink(undefined, "s")).toBeNull();
  expect(sessionCopyLink("host", "..")).toBeNull();
});
