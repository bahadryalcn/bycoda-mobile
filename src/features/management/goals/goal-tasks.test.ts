import { expect, it } from "vitest";
import { goalTaskScope, goalTaskViews, goalTasksStamp } from "./goal-tasks";

const task = (id: string, status: string) => ({ id, title: `Task ${id}`, status }) as never;
const goal = (id: string, status: string, taskIds: string[], updatedAt = 1) =>
  ({ id, status, taskIds, updatedAt }) as never;

it("does not load or poll the task list without a task-owning epic", () => {
  expect(goalTaskScope(undefined)).toEqual({ enabled: false, interval: false });
  expect(goalTaskScope([])).toEqual({ enabled: false, interval: false });
  expect(goalTaskScope([goal("a", "awaiting-approval", []), goal("b", "running", [])])).toEqual({ enabled: false, interval: false });
});

it("polls only while a visible task-owning epic can still change", () => {
  expect(goalTaskScope([goal("a", "running", ["t1"])])).toEqual({ enabled: true, interval: 15_000 });
  expect(goalTaskScope([goal("a", "blocked", ["t1"])]).interval).toBe(15_000);
  expect(goalTaskScope([goal("a", "done", ["t1"]), goal("b", "cancelled", ["t2"])])).toEqual({ enabled: true, interval: false });
  expect(goalTaskScope([goal("a", "done", ["t1"]), goal("b", "running", [])])).toEqual({ enabled: true, interval: false });
});

it("stamps task-owning epics so a status or update change is detectable", () => {
  const before = goalTasksStamp([goal("a", "running", ["t1"], 1), goal("b", "planning", [], 1)]);
  expect(goalTasksStamp([goal("a", "running", ["t1"], 1), goal("b", "running", [], 9)])).toBe(before);
  expect(goalTasksStamp([goal("a", "done", ["t1"], 2)])).not.toBe(before);
  expect(goalTasksStamp(undefined)).toBe("");
});

it("derives progress and tasks per epic from one index of the task list", () => {
  const views = goalTaskViews(
    [goal("a", "running", ["t2", "t1", "gone"]), goal("b", "done", ["t3"]), goal("c", "planning", [])],
    [task("t1", "done"), task("t2", "running"), task("t3", "done"), task("other", "done")],
  );
  expect(views.get("a")).toEqual({
    progress: { done: 1, total: 3 },
    tasks: [task("t2", "running"), task("t1", "done")],
  });
  expect(views.get("b")).toEqual({ progress: { done: 1, total: 1 }, tasks: [task("t3", "done")] });
  expect(views.get("c")).toEqual({ progress: { done: 0, total: 0 }, tasks: [] });
});

it("lists a task once when the plan repeats its id", () => {
  const view = goalTaskViews([goal("a", "running", ["t1", "t1"])], [task("t1", "done")]).get("a");
  expect(view?.tasks).toEqual([task("t1", "done")]);
  expect(view?.progress).toEqual({ done: 2, total: 2 });
});

it("scales with the planned ids, not epics times tasks", () => {
  const tasks = Array.from({ length: 20_000 }, (_, index) => task(`t${index}`, index % 2 ? "done" : "running"));
  const goals = Array.from({ length: 200 }, (_, index) => goal(`g${index}`, "running", [`t${index}`, `t${index + 1}`]));
  const started = performance.now();
  const views = goalTaskViews(goals, tasks);
  expect(performance.now() - started).toBeLessThan(250);
  expect(views.size).toBe(200);
  expect(views.get("g1")?.progress).toEqual({ done: 1, total: 2 });
});
