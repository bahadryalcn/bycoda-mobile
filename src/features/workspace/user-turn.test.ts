import { expect, it } from "vitest";
import { CONTINUE_PROMPT, RESUME_PROMPT } from "../../../../src/features/sessions/model/userPromptText";
import { taskKickoffObjective, userPromptDisplay, userTurn, userTurnAuthorLabel } from "./user-turn";
import type { Block } from "./wire";

const user = (text: string, fields: Partial<Block> = {}) => ({ role: "user", text, ...fields }) as Block;
const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace("{p0}", String(values?.p0 ?? ""));

it("shows app resume prompts as a resume row, not as text the owner typed", () => {
  expect(userTurn(user(CONTINUE_PROMPT))).toEqual({ kind: "resume", resume: "restart" });
  expect(userTurn(user(`  ${RESUME_PROMPT}\n`))).toEqual({ kind: "resume", resume: "resume" });
  expect(userTurn(user(RESUME_PROMPT, { attachments: [{ name: "a.png" }] } as Partial<Block>))).toEqual({ kind: "message" });
  expect(userTurn(user("Continue please"))).toEqual({ kind: "message" });
});

it("splits delegate notices into sections instead of an owner bubble", () => {
  const turn = userTurn(
    user("Subagent completion: Reviewer (run-1), status succeeded.\n\nAll good.", {
      author: { kind: "delegation", runId: "run-1", title: "Reviewer", reason: "completion" },
    }),
  );
  expect(turn).toMatchObject({
    kind: "delegation",
    sections: [{ runId: "run-1", title: "Reviewer", reason: "completion", status: "succeeded", body: "All good." }],
  });
});

it("hides crew envelopes and legacy command prefixes from the visible prompt", () => {
  expect(userPromptDisplay("Fix it\n\n<bycoda_assignment id=\"1\">secret</bycoda_assignment>")).toBe("Fix it");
  expect(userPromptDisplay("/bycoda list sessions")).toBe("list sessions");
  expect(userPromptDisplay("plain")).toBe("plain");
});

it("reads the matching versioned objective only from a generated task kickoff", () => {
  const author = { kind: "task", id: "task-1", name: "Check receipts", reason: "kickoff" } as const;
  const contract = JSON.stringify({
    schema: "bycoda.task-contract.v1",
    task: { id: author.id, instructions: { objective: "  Check the receipt layout.  " } },
  }, null, 2);
  const text = `Execution instructions.\n\n${contract}\n\nPrevious attempt feedback.`;
  expect(taskKickoffObjective(text, author)).toBe("Check the receipt layout.");
  expect(taskKickoffObjective(text, undefined)).toBeUndefined();
  expect(taskKickoffObjective(text, { ...author, reason: "review" })).toBeUndefined();
  expect(taskKickoffObjective(text, { ...author, id: "another-task" })).toBeUndefined();
  expect(taskKickoffObjective(contract.slice(0, -1), author)).toBeUndefined();
  expect(taskKickoffObjective("Legacy task prompt", author)).toBeUndefined();
});

it("names who wrote a prompt the owner did not type", () => {
  expect(userTurnAuthorLabel(undefined, copy)).toBeUndefined();
  expect(userTurnAuthorLabel({ kind: "task", id: "t", name: "x", reason: "r" }, copy)).toBe("Task wrote");
  expect(
    userTurnAuthorLabel({ kind: "assistant", name: "Ada", jobId: "j", reason: "nudge", operationId: "o" }, copy),
  ).toBe("Ada wrote");
});
