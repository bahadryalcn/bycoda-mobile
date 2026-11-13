import type { QuestionDraft, QuestionCardProps } from "./session-types";

type Item = QuestionCardProps["question"]["questions"][number];

/** Marks a typed-only answer so the questionnaire counts the question as answered. Never sent. */
export const TYPED_ANSWER = "__typed__";
export const CUSTOM_OPTION = "__custom__";

const customText = (item: Item, draft: QuestionDraft) =>
  item.preserveCustomWhitespace ? draft.custom[item.id] : draft.custom[item.id]?.trim();

export function isCustomChoice(item: Item, id: string) {
  const option = item.options.find((option) => option.id === id);
  return id === CUSTOM_OPTION || !!option && option.literal !== true && /^other$/i.test(option.label.trim());
}

/** Typing is an explicit custom selection; a single choice must not win over it. */
export function updateCustomAnswer(item: Item, draft: QuestionDraft, text: string) {
  const selected = draft.answers[item.id] ?? [];
  const customId = selected.find((id) => isCustomChoice(item, id)) ??
    item.options.find((option) => isCustomChoice(item, option.id))?.id ?? CUSTOM_OPTION;
  return {
    custom: { ...draft.custom, [item.id]: text },
    ...(item.options.length ? { answers: { ...draft.answers, [item.id]: item.multiSelect
      ? [...selected.filter((id) => !isCustomChoice(item, id)), customId]
      : [customId] } } : {}),
  };
}

/** Draft -> controlled Questionnaire answers (single choice is a string, multi an array). */
export function toQuestionnaireAnswers(items: Item[], draft: QuestionDraft) {
  const out: Record<string, string | string[]> = {};
  for (const item of items) {
    const selected = draft.answers[item.id] ?? [];
    const attached = item.allowCustom && !item.preserveCustomWhitespace && !!draft.attachments?.[item.id]?.length;
    const values = selected.length ? selected : customText(item, draft) || attached ? [TYPED_ANSWER] : [];
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
  const files = item.allowCustom && !item.preserveCustomWhitespace && !!draft.attachments?.[item.id]?.length;
  if (!selected.length) return item.allowCustom && (!!text || files);
  if ((!item.multiSelect && selected.length !== 1) || new Set(selected).size !== selected.length) return false;
  return selected.every((id) => isCustomChoice(item, id)
    ? item.allowCustom && (!!text || files)
    : item.options.some((option) => option.id === id));
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
  const attachments: Record<string, { id: string; name: string; mimeType: string; kind: "image" | "audio" | "file"; size: number }[]> = {};
  for (const item of items) {
    const text = customText(item, draft);
    if (text) custom[item.id] = text;
    const note = draft.notes?.[item.id]?.trim();
    if (note && noteApplies(item, draft)) notes[item.id] = note;
    const files = draft.attachments?.[item.id];
    if (item.allowCustom && !item.preserveCustomWhitespace && files?.length)
      attachments[item.id] = files.map(({ id, name, mimeType, kind, size }) => ({ id, name, mimeType, kind, size }));
  }
  return {
    kind: "answered" as const,
    answers: draft.answers,
    custom,
    ...(Object.keys(notes).length ? { notes } : {}),
    ...(Object.keys(attachments).length ? { attachments } : {}),
  };
}
