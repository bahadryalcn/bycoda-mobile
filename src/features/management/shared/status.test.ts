import { expect, it, vi } from "vitest";
vi.mock("@/ui/primitives", () => ({ Badge: "Badge" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
import { Status, statusLabel } from "./status";

const copy = (_tr: string, en: string) => en;

it("names every job state in words and gives problems and finished work their own tone", () => {
  const states = { queued: "Queued", running: "Running", paused: "Paused", blocked: "Blocked", failed: "Failed", cancelled: "Cancelled", completed: "Completed" };
  for (const [value, label] of Object.entries(states)) expect(statusLabel(value, copy)).toBe(label);
  const tone = (value: string) => Status({ value }).props.tone;
  expect(tone("running")).toBe("live");
  expect(tone("blocked")).toBe("danger");
  expect(tone("failed")).toBe("danger");
  expect(tone("completed")).toBe("success");
  expect(["queued", "paused", "cancelled"].map(tone)).toEqual(["default", "default", "default"]);
});

it("localizes a skipped automation run", () => {
  expect(statusLabel("skipped", copy)).toBe("Skipped");
  expect(statusLabel("skipped", (tr) => tr)).toBe("Atlanan");
});
