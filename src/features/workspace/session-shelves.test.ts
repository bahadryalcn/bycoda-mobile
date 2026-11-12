import { expect, it } from "vitest";
import { sessionShelfRows } from "./session-collection";
import type { ActiveSession } from "./activity-model";

const entry = (id: string, extra: object = {}) =>
  ({ project: { id: "p" }, session: { id, status: "idle", updatedAt: 1, ...extra } }) as unknown as ActiveSession;
const kinds = (rows: ReturnType<typeof sessionShelfRows>) =>
  rows.map((row) => (row.kind === "header" ? `${row.shelf}:${row.count}:${row.expanded}` : row.key));

it("puts pinned first and keeps settled sessions in a collapsed final group", () => {
  const rows = sessionShelfRows(
    [entry("a"), entry("b", { pinned: true }), entry("c")],
    {},
    false,
    false,
    new Set(["c"]),
  );
  expect(kinds(rows)).toEqual(["pinned:1:true", "p:b", "recent:1:true", "p:a", "settled:1:false"]);
});
it("expands settled on request and while searching; running settled stays active", () => {
  expect(kinds(sessionShelfRows([entry("c")], { settled: false }, false, false, new Set(["c"])))).toEqual([
    "settled:1:true",
    "p:c",
  ]);
  expect(kinds(sessionShelfRows([entry("c")], {}, true, false, new Set(["c"])))[0]).toBe("settled:1:true");
  expect(kinds(sessionShelfRows([entry("c", { status: "running" })], {}, false, false, new Set(["c"])))[0]).toBe(
    "running:1:true",
  );
});
