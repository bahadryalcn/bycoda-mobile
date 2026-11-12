import { expect, it } from "vitest";
import type { HostSessionSummary } from "@/domain/types";
import { projectSessionRows } from "./project-session-shelves";

const s = (id: string, extra: object = {}) =>
  ({ id, title: id, status: "idle", updatedAt: 1, ...extra }) as unknown as HostSessionSummary;
const label = (rows: ReturnType<typeof projectSessionRows>) =>
  rows.map((row) => (row.kind === "header" ? `${row.shelf}:${row.count}:${row.expanded}` : row.key));

it("lists pinned first and settled last, folded", () => {
  const rows = projectSessionRows([s("a"), s("b", { pinned: true }), s("c")], undefined, {}, {}, false, new Set(["c"]), false);
  expect(label(rows)).toEqual(["pinned:1:true", "session:b", "session:a", "settled:1:false"]);
});
it("expands settled on request or search and leaves archived flat", () => {
  expect(label(projectSessionRows([s("c")], undefined, {}, { settled: false }, false, new Set(["c"]), false)))
    .toEqual(["settled:1:true", "session:c"]);
  expect(label(projectSessionRows([s("c")], undefined, {}, {}, true, new Set(["c"]), false))[0]).toBe("settled:1:true");
  expect(label(projectSessionRows([s("c", { pinned: true })], undefined, {}, {}, false, new Set(["c"]), true))).toEqual(["session:c"]);
});
