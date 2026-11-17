/** One message of a side thread. The thread lives on the phone only; the session is never changed. */
export type SideChatMessage = { id: string; role: "user" | "assistant"; text: string };

export const SIDE_CHAT_MAX_QUESTION = 4000;
/** The Host accepts at most this many earlier messages per call. */
export const SIDE_CHAT_MAX_HISTORY = 20;
const MAX_ANSWER_HISTORY = 16000;

export const normalizeQuestion = (draft: string) => draft.trim();

export const canAskSideQuestion = (draft: string, busy: boolean) =>
  !busy && normalizeQuestion(draft).length > 0 && normalizeQuestion(draft).length <= SIDE_CHAT_MAX_QUESTION;

/** Earlier turns for the next call, newest kept when the thread outgrows the Host limit. */
export function sideChatHistory(messages: readonly SideChatMessage[]) {
  return messages
    .slice(-SIDE_CHAT_MAX_HISTORY)
    .map((message) => ({ role: message.role, text: message.text.slice(0, MAX_ANSWER_HISTORY) }));
}

/** The answer text, or null when the Host reply is not the expected shape. */
export function parseSideAnswer(raw: unknown): string | null {
  const answer = (raw as { answer?: unknown } | null)?.answer;
  return typeof answer === "string" && answer.trim() ? answer : null;
}
