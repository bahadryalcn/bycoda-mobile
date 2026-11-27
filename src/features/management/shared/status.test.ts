import { expect, it, vi } from "vitest";
vi.mock("@/ui/primitives", () => ({ Badge: "Badge", StatusText: "StatusText" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
import { Status, statusLabel } from "./status";

const copy = (_tr: string, en: string) => en;

it("names every job state in words, tints only problems and keeps normal states quiet", () => {
  const states = { queued: "Queued", running: "Running", paused: "Paused", blocked: "Blocked", failed: "Failed", cancelled: "Cancelled", completed: "Completed" };
  for (const [value, label] of Object.entries(states)) expect(statusLabel(value, copy)).toBe(label);
  const tone = (value: string) => Status({ value }).props.tone;
  const kind = (value: string) => Status({ value }).type;
  expect(tone("running")).toBe("live");
  expect(kind("running")).toBe("StatusText");
  expect(tone("blocked")).toBe("danger");
  expect(tone("failed")).toBe("danger");
  expect(kind("failed")).toBe("Badge");
  expect(tone("needs-input")).toBe("warning");
  expect(kind("needs-input")).toBe("Badge");
  expect(tone("completed")).toBe("default");
  expect(kind("completed")).toBe("StatusText");
  expect(["queued", "paused", "cancelled"].map(tone)).toEqual(["default", "default", "default"]);
});

it("localizes a skipped automation run", () => {
  expect(statusLabel("skipped", copy)).toBe("Skipped");
  expect(statusLabel("skipped", (tr) => tr)).toBe("Atlanan");
});

it("names an unrecognized record state neutrally", () => {
  expect(Status({ value: "new-host-state" }).props.label).toBe("Unknown");
  expect(statusLabel("new-host-state", copy)).toBe("new host state");
});
