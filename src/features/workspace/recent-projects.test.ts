import { describe, expect, it } from "vitest";
import { lastUsedProject, orderProjectsByRecency, projectRecency, recentProjects } from "./recent-projects";

const project = (id: string) => ({ id });
const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe("recent projects", () => {
  it("orders by the newer of session activity and last opened", () => {
    const rows = ["a", "b", "c"].map(project);
    expect(ids(orderProjectsByRecency(rows, { activity: { a: 100, b: 50 }, opened: { b: 200, c: 150 } }))).toEqual(["b", "c", "a"]);
  });

  it("keeps the given order for ties and puts projects without timestamps last", () => {
    const rows = ["a", "b", "c", "d"].map(project);
    expect(ids(orderProjectsByRecency(rows, { activity: { c: 10, b: 10 }, opened: { d: 0, a: Number.NaN } }))).toEqual(["b", "c", "a", "d"]);
  });

  it("excludes projects the visibility gate hides", () => {
    const rows = ["a", "b", "c"].map(project);
    expect(ids(recentProjects(rows, { activity: { a: 3, b: 2, c: 1 }, opened: {}, isVisible: (id) => id !== "a" }))).toEqual(["b", "c"]);
  });

  it("returns at most the limit, and fewer when fewer exist", () => {
    const rows = ["a", "b", "c", "d", "e", "f", "g"].map(project);
    const activity = Object.fromEntries(rows.map((row, index) => [row.id, index + 1]));
    expect(ids(recentProjects(rows, { activity, opened: {} }))).toEqual(["g", "f", "e", "d", "c"]);
    expect(ids(recentProjects(rows.slice(0, 2), { activity, opened: {} }))).toEqual(["b", "a"]);
    expect(recentProjects([], { activity, opened: {} })).toEqual([]);
  });

  it("reads recency from either source", () => {
    expect(projectRecency("a", { activity: { a: 5 }, opened: { a: 9 } })).toBe(9);
    expect(projectRecency("z", { activity: {}, opened: {} })).toBe(0);
  });
});

describe("last used project", () => {
  it("returns the newest used visible project and nothing when none was used", () => {
    const rows = ["a", "b"].map(project);
    expect(lastUsedProject(rows, { activity: { a: 1 }, opened: { b: 5 } })?.id).toBe("b");
    expect(lastUsedProject(rows, { activity: { a: 1 }, opened: { b: 5 }, isVisible: (id) => id !== "b" })?.id).toBe("a");
    expect(lastUsedProject(rows, { activity: {}, opened: {} })).toBeUndefined();
  });
});
