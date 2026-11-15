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
it("orders folders, the pinned group with pinned folders, loose, then settled like desktop", () => {
  const layout = {
    folders: [
      { id: "f", name: "f", sessionIds: ["inF", "pinInF"], collapsed: false },
      { id: "pf", name: "pf", sessionIds: ["inPf"], collapsed: false, pinned: true },
    ],
    order: {},
  } as never;
  const rows = projectSessionRows(
    [s("loose"), s("inF"), s("pinInF", { pinned: true }), s("inPf"), s("pin", { pinned: true }), s("old", { updatedAt: 0 })],
    layout, {}, { settled: false }, false, new Set(["old", "inF"]), false,
  );
  expect(label(rows)).toEqual([
    "folder:f", "session:pinInF", "session:inF",
    "pinned:2:true", "folder:pf", "session:inPf", "session:pin",
    "session:loose",
    "settled:1:true", "session:old",
  ]);
});
it("ranks each group by desktop status: input, failed, unseen done, working, waiting, draft", () => {
  const now = 10;
  const rows = projectSessionRows(
    [
      s("idle"), s("draft", { draft: true }), s("waiting", { waiting: { kind: "background" } }),
      s("done"), s("failed", { issue: "failed" }), s("input", { needsInput: true }),
    ],
    undefined, {}, {}, false, new Set(), false, { doneIds: new Set(["done"]), now },
  );
  expect(label(rows)).toEqual([
    "session:input", "session:failed", "session:done", "session:waiting", "session:draft", "session:idle",
  ]);
});
