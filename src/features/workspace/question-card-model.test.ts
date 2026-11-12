import { expect, it } from "vitest";
import {
  TYPED_ANSWER,
  buildReply,
  fromQuestionnaireAnswer,
  questionComplete,
  toQuestionnaireAnswers,
} from "./question-card-model";

const item = (extra = {}) => ({
  id: "q",
  prompt: "P",
  allowCustom: true,
  multiSelect: false,
  options: [{ id: "a", label: "A" }],
  ...extra,
});

it("maps drafts to questionnaire answers and back without leaking the typed marker", () => {
  const typed = { answers: {}, custom: { q: "hi" } };
  expect(toQuestionnaireAnswers([item()], typed)).toEqual({ q: TYPED_ANSWER });
  expect(fromQuestionnaireAnswer([TYPED_ANSWER, "a"])).toEqual(["a"]);
  expect(toQuestionnaireAnswers([item({ multiSelect: true })], { answers: { q: ["a"] }, custom: {} })).toEqual({ q: ["a"] });
  expect(toQuestionnaireAnswers([item()], { answers: {}, custom: {} })).toEqual({ q: "" });
});

it("requires text when the custom option is chosen", () => {
  expect(questionComplete(item(), { answers: { q: ["__custom__"] }, custom: {} })).toBe(false);
  expect(questionComplete(item(), { answers: { q: ["__custom__"] }, custom: { q: "x" } })).toBe(true);
});

it("builds the reply with trimmed notes only beside a real choice", () => {
  const reply = buildReply([item()], { answers: { q: ["a"] }, custom: {}, notes: { q: " n " } });
  expect(reply).toEqual({ kind: "answered", answers: { q: ["a"] }, custom: {}, notes: { q: "n" } });
});
