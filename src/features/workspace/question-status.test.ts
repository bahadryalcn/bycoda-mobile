import { describe, expect, it } from "vitest";
import type { UserQuestionPrompt } from "./wire-types";
import {
  questionDismissLabel,
  questionNeedsAttention,
  questionStatusLabel,
  questionSubmissionHeld,
} from "./question-status";

const prompt: UserQuestionPrompt = { requestId: 7, questions: [] };
const english = (_tr: string, en: string) => en;

describe("mobile provider-owned question state", () => {
  it("does not claim unknown or asynchronous work is waiting", () => {
    expect(questionStatusLabel(prompt, english)).toBe("Open question");
    expect(questionStatusLabel({ ...prompt, behavior: "nonBlocking" }, english)).toBe(
      "Open question · work may continue",
    );
    expect(questionStatusLabel({ ...prompt, behavior: "blocking" }, english)).toBe(
      "Waiting for your answer",
    );
  });

  it.each(["sending", "queued", "unknown"] as const)("holds %s answers against duplicate dispatch", (delivery) => {
    expect(questionSubmissionHeld({ ...prompt, delivery })).toBe(true);
    expect(questionStatusLabel({ ...prompt, delivery, behavior: "blocking" }, english)).not.toBe(
      "Waiting for your answer",
    );
  });

  it("allows an explicit retry only after a known failure", () => {
    expect(questionSubmissionHeld({ ...prompt, delivery: "failed" })).toBe(false);
    expect(questionNeedsAttention({ ...prompt, delivery: "failed" })).toBe(true);
    expect(questionNeedsAttention({ ...prompt, behavior: "nonBlocking" })).toBe(false);
    expect(questionNeedsAttention({ ...prompt, behavior: "blocking", delivery: "queued" })).toBe(false);
  });

  it("names the provider's actual dismiss action", () => {
    expect(questionDismissLabel({ ...prompt, dismissAction: "cancel" }, english)).toBe("Cancel question");
    expect(questionDismissLabel({ ...prompt, dismissAction: "decline" }, english)).toBe("Decline");
    expect(questionDismissLabel({ ...prompt, dismissAction: "skip" }, english)).toBe("Skip");
  });
});
