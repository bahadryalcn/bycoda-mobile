import { expect, it } from "vitest";
import {
  buildAnswerIntent,
  buildSnoozeIntent,
  CUSTOM_OPTION_ID,
  emptyQuestionSelection,
  ownerQuestionActionable,
  toggleQuestionOption,
} from "./assistant-question";

const item = (overrides = {}) => ({
  id: "k1",
  prompt: "Which?",
  multiSelect: false,
  allowCustom: true,
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  ...overrides,
});
const question = (items = [item()], overrides = {}) =>
  ({
    id: "q1",
    version: 2,
    jobId: "j",
    projectIds: ["p1"],
    sourceToken: "a".repeat(64),
    origin: "chief",
    prompt: { requestId: 1, occurrenceId: "o", behavior: "nonBlocking", questions: items },
    status: "open",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }) as never;

it("builds an answer from exact option IDs and a typed answer replaces a single choice", () => {
  const q = question();
  const picked = toggleQuestionOption(emptyQuestionSelection(), item() as never, "b");
  expect(buildAnswerIntent(q, picked, "r1")).toEqual({
    op: "questions.answer",
    id: "q1",
    expectedVersion: 2,
    requestId: "r1",
    answers: { k1: ["b"] },
  });
  const typed = { answers: picked.answers, custom: { k1: "  something else " } };
  expect(buildAnswerIntent(q, typed, "r2")).toMatchObject({
    answers: { k1: [CUSTOM_OPTION_ID] },
    custom: { k1: "something else" },
  });
  expect(toggleQuestionOption(picked, item() as never, "a").answers.k1).toEqual(["a"]);
  expect(toggleQuestionOption(picked, item() as never, "b").answers.k1).toEqual([]);
});
it("keeps several choices on a multi-select question and rejects an incomplete answer", () => {
  const multi = item({ multiSelect: true, allowCustom: false });
  let selection = toggleQuestionOption(emptyQuestionSelection(), multi as never, "a");
  selection = toggleQuestionOption(selection, multi as never, "b");
  expect(buildAnswerIntent(question([multi]), selection, "r").answers.k1).toEqual(["a", "b"]);
  expect(() => buildAnswerIntent(question([multi]), emptyQuestionSelection(), "r")).toThrow(
    "Choose valid",
  );
  expect(() =>
    buildAnswerIntent(
      question([item({ allowCustom: false })]),
      { answers: { k1: ["zzz"] }, custom: {} },
      "r",
    ),
  ).toThrow("Choose valid");
});
it("postpones for one hour with the exact version", () => {
  expect(buildSnoozeIntent(question(), "r", 1000)).toEqual({
    op: "questions.snooze",
    id: "q1",
    expectedVersion: 2,
    requestId: "r",
    until: 1000 + 3_600_000,
  });
});
it("shows only questions that are open, current and entirely in visible projects", () => {
  const visible = (id: string) => id === "p1";
  expect(ownerQuestionActionable(question(), visible, true)).toBe(true);
  expect(ownerQuestionActionable(question(), visible, false)).toBe(false);
  const other = (overrides: object) => question([item()], overrides);
  expect(ownerQuestionActionable(other({ projectIds: ["p1", "hidden"] }), visible, true)).toBe(false);
  expect(ownerQuestionActionable(other({ status: "answered" }), visible, true)).toBe(false);
  expect(ownerQuestionActionable(other({ sourceCurrent: false }), visible, true)).toBe(false);
  expect(ownerQuestionActionable(other({ projectIds: [] }), visible, true)).toBe(false);
});
