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

it("requires text for provider Other IDs but accepts literal Other choices", () => {
  const options = [{ id: "provider-other", label: " Other " }];
  const draft = { answers: { q: ["provider-other"] }, custom: {} };
  expect(questionComplete(item({ options }), draft)).toBe(false);
  expect(questionComplete(item({ options: [{ ...options[0], literal: true }] }), draft)).toBe(true);
});

it("rejects unknown IDs, duplicates and multiple answers on required single choices", () => {
  for (const ids of [["missing"], ["a", "a"], ["a", "__custom__"]]) {
    expect(questionComplete(item(), { answers: { q: ids }, custom: { q: "typed" } })).toBe(false);
  }
});

it("isolates per-question files and accepts attachment-only ordinary answers, never typed-schema files", () => {
  const file = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "proof.png", mimeType: "image/png", kind: "image" as const, size: 4 };
  const staged = { ...file, uri: "file:///proof" };
  const draft = { answers: {}, custom: {}, attachments: { q: [staged], second: [{ ...staged, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }], typed: [staged] } };
  expect(questionComplete(item(), draft)).toBe(true);
  expect(toQuestionnaireAnswers([item()], draft)).toEqual({ q: TYPED_ANSWER });
  expect(questionComplete(item({ id: "typed", preserveCustomWhitespace: true }), draft)).toBe(false);
  expect(buildReply([item(), item({ id: "second" }), item({ id: "typed", preserveCustomWhitespace: true })], draft)).toMatchObject({ attachments: { q: [file], second: [{ ...file, id: staged.id.replaceAll("a", "b") }] } });
  expect(buildReply([item({ id: "typed", preserveCustomWhitespace: true })], draft)).not.toHaveProperty("attachments");
});
