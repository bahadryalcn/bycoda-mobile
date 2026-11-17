import { parseSideAnswer, sideChatHistory, type SideChatMessage } from "./side-chat-model";

export type SideChatPort = {
  request(
    method: string,
    params: Record<string, unknown>,
    options: { retry: false; signal?: AbortSignal; timeoutMs?: number },
  ): Promise<unknown>;
};

export const SIDE_QUESTION_METHOD = "sessions.sideQuestion";

/** One read-only question; never retried, so a slow answer is not asked twice. */
export async function askSideQuestion(
  port: SideChatPort,
  input: { sessionId: string; question: string; history: readonly SideChatMessage[] },
  signal?: AbortSignal,
): Promise<string> {
  const raw = await port.request(
    SIDE_QUESTION_METHOD,
    { sessionId: input.sessionId, question: input.question, history: sideChatHistory(input.history) },
    { retry: false, signal, timeoutMs: 150_000 },
  );
  const answer = parseSideAnswer(raw);
  if (answer === null) throw new Error("The computer returned an unreadable answer.");
  return answer;
}
