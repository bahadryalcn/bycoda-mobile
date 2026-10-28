import type { UserQuestionPrompt } from "./wire-types";
import type { QuestionDraft } from "./session-types";

export type QuestionCardState = {
  draft: QuestionDraft;
  delivery?: UserQuestionPrompt["delivery"];
};

/** Navigation may remount a card while its delivery is still uncertain. */
export class QuestionCardStateStore {
  private readonly entries = new Map<string, { scope: string; state: QuestionCardState }>();

  constructor(private readonly limit = 64) {}

  private key(scope: string, question: UserQuestionPrompt): string {
    return JSON.stringify([scope, question.providerTurnId, question.callId, question.requestId, question.questions]);
  }

  read(scope: string | undefined, question: UserQuestionPrompt): QuestionCardState | undefined {
    return scope ? this.entries.get(this.key(scope, question))?.state : undefined;
  }

  write(scope: string | undefined, question: UserQuestionPrompt, state: QuestionCardState): void {
    if (!scope) return;
    const key = this.key(scope, question);
    this.entries.delete(key);
    this.entries.set(key, { scope, state });
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }

  /** Called only with an authoritative snapshot, never just because a card unmounted. */
  retain(scope: string, questions: UserQuestionPrompt[]): void {
    const active = new Set(questions.map((question) => this.key(scope, question)));
    for (const [key, entry] of this.entries) {
      if (entry.scope === scope && !active.has(key)) this.entries.delete(key);
    }
  }
}

export const questionCardStates = new QuestionCardStateStore();
