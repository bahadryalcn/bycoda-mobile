import { describe, expect, it } from "vitest";
import { QuestionCardStateStore } from "./question-card-state";
import type { UserQuestionPrompt } from "./wire-types";

const question: UserQuestionPrompt = { requestId: 1, callId: "call", questions: [] };
const state = { draft: { answers: {}, custom: { answer: "keep this draft" } }, delivery: "unknown" as const };

describe("mobile question state across navigation", () => {
  it("retains uncertain delivery and the draft when the same question remounts", () => {
    const store = new QuestionCardStateStore();
    store.write("machine/session/run", question, state);
    expect(store.read("machine/session/run", { ...question })).toEqual(state);
  });

  it("isolates machines, sessions and reused provider question identifiers", () => {
    const store = new QuestionCardStateStore();
    store.write("machine-a/session/run", question, state);
    expect(store.read("machine-b/session/run", question)).toBeUndefined();
    expect(store.read("machine-a/another/run", question)).toBeUndefined();
    expect(store.read("machine-a/session/run", { ...question, callId: "another-call" })).toBeUndefined();
  });

  it("clears only questions absent from the authoritative owner snapshot", () => {
    const store = new QuestionCardStateStore();
    store.write("one", question, state);
    store.write("two", question, state);
    store.retain("one", []);
    expect(store.read("one", question)).toBeUndefined();
    expect(store.read("two", question)).toEqual(state);
  });

  it("bounds retained in-memory state", () => {
    const store = new QuestionCardStateStore(2);
    store.write("one", question, state);
    store.write("two", question, state);
    store.write("three", question, state);
    expect(store.read("one", question)).toBeUndefined();
    expect(store.read("two", question)).toEqual(state);
  });
});
