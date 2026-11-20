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

/** A side thread saved on the phone per computer and session, with the question still being typed. */
export type SideChatThread = { messages: SideChatMessage[]; draft: string };

export const emptySideChatThread = (): SideChatThread => ({ messages: [], draft: "" });

export const sideChatKey = (machineId: string, sessionId: string) =>
  `bycoda.mobile.side-chat.v1:${JSON.stringify([machineId, sessionId])}`;

const THREAD_PREFIX = "bycoda-side-chat-v1:\n";
const isSideChatMessage = (value: unknown): value is SideChatMessage => {
  const message = value as Partial<SideChatMessage> | null;
  return !!message && typeof message.id === "string" && (message.role === "user" || message.role === "assistant") && typeof message.text === "string";
};

/** Null when the thread holds nothing worth keeping. */
export function encodeSideChatThread(value: SideChatThread | null): string | null {
  return !value || (!value.messages.length && !value.draft) ? null : `${THREAD_PREFIX}${JSON.stringify(value)}`;
}

/** Throws on anything unreadable, so the owner keeps the stored entry instead of overwriting it. */
export function decodeSideChatThread(raw: string): SideChatThread {
  const value = raw.startsWith(THREAD_PREFIX) ? (JSON.parse(raw.slice(THREAD_PREFIX.length)) as Partial<SideChatThread> | null) : null;
  if (!value || typeof value.draft !== "string" || !Array.isArray(value.messages) || !value.messages.every(isSideChatMessage))
    throw new Error("The saved side question could not be read.");
  return { messages: value.messages, draft: value.draft };
}

/** Earlier messages the next question will not send to the agent; the UI marks them. */
export const sideChatOutOfContextCount = (messages: readonly SideChatMessage[]) =>
  Math.max(0, messages.length - SIDE_CHAT_MAX_HISTORY);

/** The answer text, or null when the Host reply is not the expected shape. */
export function parseSideAnswer(raw: unknown): string | null {
  const answer = (raw as { answer?: unknown } | null)?.answer;
  return typeof answer === "string" && answer.trim() ? answer : null;
}
