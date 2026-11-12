import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
import type { DirectorySection } from "./project-directory";
import { applyCustomOrder, applySavedOrder, moveId, moveInOrder, normalizeProjectOrder, orderFromSections } from "./project-order";

const project = (id: string) => ({ id, name: id, cwd: `/${id}` }) as DirectorySection["data"][number];
const section = (key: string, ids: string[]): DirectorySection =>
  ({ key, count: ids.length, total: ids.length, running: 0, expanded: true, data: ids.map(project) });

describe("project custom order", () => {
  it("normalizes untrusted input", () => {
    expect(normalizeProjectOrder(null)).toEqual({ groups: [], projects: {}, flat: [] });
    expect(normalizeProjectOrder({ groups: ["a", 1, "a", "b"], projects: { g: ["x", null, "x"], h: "no" }, flat: "no" }))
      .toEqual({ groups: ["a", "b"], projects: { g: ["x"], h: [] }, flat: [] });
    expect(normalizeProjectOrder({ flat: Array.from({ length: 3000 }, (_, i) => `p${i}`) }).flat).toHaveLength(2000);
  });
  it("ignores stale ids and appends new ones in computer order", () => {
    expect(applySavedOrder(["a", "b", "c", "d"], (id) => id, ["c", "gone", "a"])).toEqual(["c", "a", "b", "d"]);
    expect(applySavedOrder(["a", "b"], (id) => id, undefined)).toEqual(["a", "b"]);
  });
  it("moves one item", () => {
    expect(moveId(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b"], 0, 5)).toEqual(["a", "b"]);
  });
  it("orders groups and their projects, and flat lists", () => {
    const sections = [section("g1", ["a", "b"]), section("", ["c"])];
    const ordered = applyCustomOrder(sections, { groups: ["", "g1"], projects: { g1: ["b", "a"] }, flat: [] }, true);
    expect(ordered.map((item) => item.key)).toEqual(["", "g1"]);
    expect(ordered[1]!.data.map((item) => item.id)).toEqual(["b", "a"]);
    const flat = applyCustomOrder([section("", ["a", "b", "c"])], { groups: [], projects: {}, flat: ["c", "a"] }, false);
    expect(flat[0]!.data.map((item) => item.id)).toEqual(["c", "a", "b"]);
  });
  it("snapshots the visible order and applies a drag to it", () => {
    const snapshot = orderFromSections([section("g1", ["a", "b"]), section("", ["c"])], true);
    expect(snapshot).toEqual({ groups: ["g1", ""], projects: { g1: ["a", "b"], "": ["c"] }, flat: [] });
    expect(moveInOrder(snapshot, { scope: "groups", from: 0, to: 1 }).groups).toEqual(["", "g1"]);
    expect(moveInOrder(snapshot, { scope: { group: "g1" }, from: 1, to: 0 }).projects.g1).toEqual(["b", "a"]);
  });
});
