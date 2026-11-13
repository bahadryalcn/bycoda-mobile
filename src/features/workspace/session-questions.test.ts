// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionQuestions } from "./session-questions";
import type { QuestionCardProps } from "./session-types";
import type { UserQuestionPrompt } from "./wire";

const cards = vi.hoisted(() => new Map<number, QuestionCardProps>());
vi.mock("./question-attachment-card", () => ({ QuestionAttachmentCard: () => null, QuestionAttachmentCleanup: () => null }));
vi.mock("./question-card", () => ({ QuestionCard: (props: QuestionCardProps) => {
  cards.set(props.question.requestId, props);
  return createElement("div", { "data-request": props.question.requestId }, props.question.delivery);
} }));
let root: ReturnType<typeof createRoot>;
afterEach(() => { act(() => root?.unmount()); cards.clear(); vi.unstubAllGlobals(); });
const question = (requestId: number, delivery?: UserQuestionPrompt["delivery"]): UserQuestionPrompt => ({ requestId, occurrenceId: `occurrence-${requestId}`, delivery, questions: [] });

it("shows submitted delivery states without claiming provider consumption or allowing resends", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  root = createRoot(container);
  const onCommand = vi.fn();
  const pending = question(4);
  act(() => root.render(createElement(SessionQuestions, { pending, submitted: [question(1, "sending"), question(2, "queued"), question(3, "unknown"), pending], scope: { machineId: "m", sessionId: "s" }, runId: "r", revision: 4, disabled: false, onCommand })));
  expect(container.querySelectorAll("[data-request]")).toHaveLength(4);
  expect(container.textContent).toBe("sendingqueuedunknown");
  for (const id of [1, 2, 3]) {
    expect(cards.get(id)?.disabled).toBe(true);
    await expect(cards.get(id)!.onAnswer({ kind: "skipped" })).rejects.toThrow("Submitted question");
  }
  expect(onCommand).not.toHaveBeenCalled();
  await cards.get(4)!.onAnswer({ kind: "skipped" });
  expect(onCommand).toHaveBeenCalledWith({ type: "answer", sessionId: "s", runId: "r", requestId: 4, reply: { kind: "skipped" } });
});

it("rejects captured reply callbacks after the pending occurrence or session changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  const onCommand = vi.fn();
  const props = { scope: { machineId: "m", sessionId: "s" }, runId: "r", revision: 1, disabled: false, onCommand };
  act(() => root.render(createElement(SessionQuestions, { ...props, pending: question(1) })));
  const old = cards.get(1)!.onAnswer;
  act(() => root.render(createElement(SessionQuestions, { ...props, pending: question(2) })));
  expect(() => old({ kind: "skipped" })).toThrow("question changed");
  expect(onCommand).not.toHaveBeenCalled();
});
