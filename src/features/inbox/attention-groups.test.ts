import { expect, it } from "vitest";
import { attentionIcon, groupAttention, isUrgentAttention } from "./attention-groups";

it("splits urgent items from earlier ones and keeps order", () => {
  const items = [{ status: "done", id: 1 }, { status: "failed", id: 2 }, { id: 3 }, { status: "review", id: 4 }];
  const grouped = groupAttention(items);
  expect(grouped.now.map((item) => item.id)).toEqual([2, 4]);
  expect(grouped.earlier.map((item) => item.id)).toEqual([1, 3]);
  expect(grouped.ordered.map((item) => item.id)).toEqual([2, 4, 1, 3]);
  expect(isUrgentAttention({ status: "running" })).toBe(false);
});

it("chooses an icon by what the item asks for", () => {
  expect(attentionIcon({ status: "awaiting-approval", kind: "task" })).toBe("approval");
  expect(attentionIcon({ status: "blocked", kind: "task" })).toBe("failure");
  expect(attentionIcon({ status: "completed", kind: "goal" })).toBe("finished");
  expect(attentionIcon({ kind: "pull-request" })).toBe("pull-request");
  expect(attentionIcon({ kind: "session" })).toBe("question");
});

it("puts owner approvals before failures and reviews without changing peers or input", () => {
  const items = [
    { status: "review", id: 1 }, { status: "done", id: 2 },
    { status: "failed", id: 3 }, { status: "awaiting-approval", id: 4 },
    { status: "blocked", id: 5 }, { status: "awaiting-approval", id: 6 },
  ];
  expect(groupAttention(items).ordered.map(item => item.id)).toEqual([4, 6, 3, 5, 1, 2]);
  expect(items.map(item => item.id)).toEqual([1, 2, 3, 4, 5, 6]);
});
