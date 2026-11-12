import type { QuestionDraft, QuestionCardProps } from "./session-types";

type Item = QuestionCardProps["question"]["questions"][number];

/** Marks a typed-only answer so the questionnaire counts the question as answered. Never sent. */
export const TYPED_ANSWER = "__typed__";
export const CUSTOM_OPTION = "__custom__";

const customText = (item: Item, draft: QuestionDraft) =>
  item.preserveCustomWhitespace ? draft.custom[item.id] : draft.custom[item.id]?.trim();

/** Draft -> controlled Questionnaire answers (single choice is a string, multi an array). */
export function toQuestionnaireAnswers(items: Item[], draft: QuestionDraft) {
  const out: Record<string, string | string[]> = {};
  for (const item of items) {
    const selected = draft.answers[item.id] ?? [];
    const values = selected.length ? selected : customText(item, draft) ? [TYPED_ANSWER] : [];
    out[item.id] = item.multiSelect ? values : (values[0] ?? "");
  }
  return out;
}

/** Questionnaire answer -> draft selection ids. */
export function fromQuestionnaireAnswer(value: string | string[] | undefined) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.filter((id) => id !== TYPED_ANSWER);
}

export function questionComplete(item: Item, draft: QuestionDraft) {
  const selected = draft.answers[item.id] ?? [];
  const text = customText(item, draft);
  if (selected.includes(CUSTOM_OPTION) && !text) return false;
  return (
    (selected.length > 0 && (item.multiSelect || selected.length === 1)) ||
    (item.allowCustom && !!text)
  );
}

/** A note is offered only beside a real (non-"Other") choice on a question that allows custom text. */
export function noteApplies(item: Item, draft: QuestionDraft) {
  return (
    item.allowCustom &&
    !item.preserveCustomWhitespace &&
    item.options.some(
      (option) =>
        option.id !== CUSTOM_OPTION &&
        (option.literal === true || !/^other$/i.test(option.label.trim())) &&
        draft.answers[item.id]?.includes(option.id),
    )
  );
}

export function buildReply(items: Item[], draft: QuestionDraft) {
  const custom: Record<string, string> = {};
  const notes: Record<string, string> = {};
  for (const item of items) {
    const text = customText(item, draft);
    if (text) custom[item.id] = text;
    const note = draft.notes?.[item.id]?.trim();
    if (note && noteApplies(item, draft)) notes[item.id] = note;
  }
  return {
    kind: "answered" as const,
    answers: draft.answers,
    custom,
    ...(Object.keys(notes).length ? { notes } : {}),
  };
}
