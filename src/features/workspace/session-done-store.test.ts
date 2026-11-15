import { beforeEach, expect, it } from "vitest";
import { observeSessionRuns, openSessionSeen, resetSessionDoneStore, unseenDoneIds } from "./session-done-store";

beforeEach(resetSessionDoneStore);

it("marks a session Done when it stops running while not open, until opened", () => {
  observeSessionRuns("m", [{ id: "a", status: "running" }]);
  observeSessionRuns("m", [{ id: "b", status: "idle" }]);
  expect(unseenDoneIds("m").size).toBe(0);
  observeSessionRuns("m", [{ id: "a", status: "idle" }]);
  expect([...unseenDoneIds("m")]).toEqual(["a"]);
  expect(unseenDoneIds("other").size).toBe(0);
  openSessionSeen("m", "a");
  expect(unseenDoneIds("m").size).toBe(0);
});

it("keeps the open session and a resumed run from turning Done", () => {
  openSessionSeen("m", "a");
  observeSessionRuns("m", [{ id: "a", status: "running" }]);
  observeSessionRuns("m", [{ id: "a", status: "idle" }]);
  expect(unseenDoneIds("m").size).toBe(0);
  observeSessionRuns("m", [{ id: "b", status: "running" }]);
  observeSessionRuns("m", [{ id: "b", status: "idle" }]);
  observeSessionRuns("m", [{ id: "b", status: "running" }]);
  expect(unseenDoneIds("m").size).toBe(0);
});
