import { expect, it } from "vitest";
import { isThreadPage } from "./thread-page";

const page = (offset = 40, total = 60) => ({
  id: "thread", eventsPreview: false, eventsPage: { offset, total, limit: 20 },
  events: Array.from({ length: Math.min(20, total - offset) }, (_, index) => ({ id: String(offset + index), text: "Full content", at: index, direction: "inbound" })),
});

it("accepts latest20, explicit bounded older pages and empty histories", () => {
  expect(isThreadPage(page(), "thread")).toBe(true);
  expect(isThreadPage(page(20), "thread", 20)).toBe(true);
  expect(isThreadPage(page(0, 0), "thread")).toBe(true);
  expect(isThreadPage(page(59), "thread", 100)).toBe(true);
});

it("rejects previews, wrong record/offset, missing metadata and oversized or incomplete responses", () => {
  const valid = page();
  expect(isThreadPage(valid, "other")).toBe(false);
  expect(isThreadPage(valid, "thread", 20)).toBe(false);
  expect(isThreadPage({ ...valid, eventsPreview: true }, "thread")).toBe(false);
  expect(isThreadPage({ ...valid, eventsPage: undefined }, "thread")).toBe(false);
  expect(isThreadPage({ ...valid, events: [...valid.events, valid.events[0]] }, "thread")).toBe(false);
  expect(isThreadPage({ ...valid, events: valid.events.slice(1) }, "thread")).toBe(false);
  expect(isThreadPage({ ...valid, eventsPage: { offset: 40, total: 60, limit: 100 } }, "thread")).toBe(false);
  expect(isThreadPage({ ...valid, eventsPage: { offset: 40, total: 60.5, limit: 20 } }, "thread")).toBe(false);
});
