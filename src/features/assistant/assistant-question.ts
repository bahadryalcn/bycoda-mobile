import type { AssistantOwnerQuestion } from "../../../../src/shared/model/assistantOwnerQuestions";
import type { AssistantQuestionIntent } from "./assistant-client";

/** Mirrors the shared question contract; the Host validates every answer again. */
export const CUSTOM_OPTION_ID = "__custom__";

export type QuestionSelection = {
  answers: Record<string, string[]>;
  custom: Record<string, string>;
};
export const emptyQuestionSelection = (): QuestionSelection => ({ answers: {}, custom: {} });
/** The owner postpones a question for one hour, matching the desktop Later action. */
export const QUESTION_SNOOZE_MS = 60 * 60 * 1000;

/** Only questions the owner may still act on and whose projects are all visible on this phone. */
export function ownerQuestionActionable(
  question: AssistantOwnerQuestion,
  visible: (projectId: string) => boolean,
  ready: boolean,
): boolean {
  return (
    (question.status === "open" || question.status === "snoozed") &&
    question.sourceCurrent !== false &&
    (question.projectIds.length === 0 ||
      (ready && question.projectIds.every((projectId) => visible(projectId)))) &&
    (question.projectIds.length > 0 ||
      (question.origin !== "chief" && !!question.threadId && !!question.ownerMessageId))
  );
}

/** Toggles one option; a single-select question keeps exactly one choice. */
export function toggleQuestionOption(
  selection: QuestionSelection,
  question: AssistantOwnerQuestion["prompt"]["questions"][number],
  optionId: string,
): QuestionSelection {
  const current = selection.answers[question.id] ?? [];
  const next = question.multiSelect
    ? current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId]
    : current.includes(optionId)
      ? []
      : [optionId];
  return {
    answers: { ...selection.answers, [question.id]: next },
    custom: question.multiSelect ? selection.custom : { ...selection.custom, [question.id]: "" },
  };
}

/** Exact canonical IDs only; free text is a value and never selects another option. */
export function buildAnswerIntent(
  question: AssistantOwnerQuestion,
  selection: QuestionSelection,
  requestId: string,
): Extract<AssistantQuestionIntent, { op: "questions.answer" }> {
  const answers: Record<string, string[]> = {};
  const custom: Record<string, string> = {};
  for (const item of question.prompt.questions) {
    const text = selection.custom[item.id]?.trim() ?? "";
    const chosen = (selection.answers[item.id] ?? []).filter((id) => id !== CUSTOM_OPTION_ID);
    answers[item.id] = text ? (item.multiSelect ? [...chosen, CUSTOM_OPTION_ID] : [CUSTOM_OPTION_ID]) : chosen;
    if (text) custom[item.id] = text;
  }
  for (const item of question.prompt.questions) {
    const selected = answers[item.id];
    const known = new Set(item.options.map((option) => option.id));
    if (
      selected.some((id) => !known.has(id) && !(id === CUSTOM_OPTION_ID && item.allowCustom)) ||
      (!item.multiSelect && selected.length > 1) ||
      (!selected.length && !item.allowCustom) ||
      ((!selected.length || selected.includes(CUSTOM_OPTION_ID)) && !custom[item.id])
    )
      throw new Error(
        "Choose valid current options or an allowed custom answer for every question.",
      );
  }
  return {
    op: "questions.answer",
    id: question.id,
    expectedVersion: question.version,
    requestId,
    answers,
    ...(Object.keys(custom).length ? { custom } : {}),
  };
}

/** Whether every question has a valid choice or custom answer, so Send can stay disabled until then. */
export function questionAnswerReady(question: AssistantOwnerQuestion, selection: QuestionSelection): boolean {
  try {
    buildAnswerIntent(question, selection, "ready");
    return true;
  } catch {
    return false;
  }
}

export function buildSnoozeIntent(
  question: AssistantOwnerQuestion,
  requestId: string,
  now: number,
): Extract<AssistantQuestionIntent, { op: "questions.snooze" }> {
  return {
    op: "questions.snooze",
    id: question.id,
    expectedVersion: question.version,
    requestId,
    until: now + QUESTION_SNOOZE_MS,
  };
}

type QuestionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
/** Intents are operation receipts, scoped to the exact question version and computer. */
export const questionIntentKey = (
  machineId: string,
  environmentId: string,
  question: Pick<AssistantOwnerQuestion, "id" | "version">,
) =>
  `bycoda.mobile.assistant-question.v1:${JSON.stringify([machineId, environmentId, question.id, question.version])}`;

export async function readQuestionIntent(
  storage: QuestionStorage,
  key: string,
  question: Pick<AssistantOwnerQuestion, "id" | "version">,
): Promise<AssistantQuestionIntent | null> {
  const raw = await storage.getItem(key);
  if (raw === null) return null;
  const value = JSON.parse(raw) as AssistantQuestionIntent;
  if (
    (value?.op !== "questions.answer" && value?.op !== "questions.snooze") ||
    value.id !== question.id ||
    value.expectedVersion !== question.version ||
    typeof value.requestId !== "string"
  )
    throw new Error("The saved answer could not be read.");
  return value;
}
export const writeQuestionIntent = (
  storage: QuestionStorage,
  key: string,
  intent: AssistantQuestionIntent,
) => storage.setItem(key, JSON.stringify(intent));
