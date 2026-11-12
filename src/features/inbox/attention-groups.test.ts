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
