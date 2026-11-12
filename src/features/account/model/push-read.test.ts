import { expect, it, vi } from "vitest";
vi.mock("../../permissions/device-permissions", () => ({ notifications: vi.fn() }));
import { accountPushPayload, presentedToDismiss, unreadIdsFor } from "./push-read";

const item = (id: string, dedupeKey: string, readAt: string | null) =>
  ({ id, dedupeKey, readAt, event: "agent.finished", title: "", body: "", createdAt: "2026-01-01T00:00:00Z" }) as never;

it("reads an opened account push and ignores computer pushes", () => {
  expect(accountPushPayload({ event: "agent.finished", dedupeKey: "abc:1" })).toEqual({ kind: "opened", dedupeKey: "abc:1" });
  expect(accountPushPayload({ kind: "finished", environmentId: "e", sessionId: "s" })).toBeNull();
  expect(accountPushPayload({ event: "nope", dedupeKey: "abc" })).toBeNull();
  expect(accountPushPayload({ event: "agent.finished", dedupeKey: "bad key!" })).toBeNull();
  expect(accountPushPayload(null)).toBeNull();
});

it("reads a silent read-sync push", () => {
  expect(accountPushPayload({ readSync: true, dedupeKeys: ["a1", 5, "b 2"] })).toEqual({ kind: "read-sync", dedupeKeys: ["a1"], badge: null });
  expect(accountPushPayload({ kind: "read_sync" })).toEqual({ kind: "read-sync", dedupeKeys: [], badge: null });
  expect(accountPushPayload({ type: "notifications.read" }, 3)).toEqual({ kind: "read-sync", dedupeKeys: [], badge: 3 });
  expect(accountPushPayload({ type: "notifications.read", badge: 0 })).toEqual({ kind: "read-sync", dedupeKeys: [], badge: 0 });
  expect(accountPushPayload({ type: "notifications.read" }, -1)).toEqual({ kind: "read-sync", dedupeKeys: [], badge: null });
});

it("selects only unread entries of the key", () => {
  const items = [item("1", "k", null), item("2", "k", "2026-01-02T00:00:00Z"), item("3", "z", null)];
  expect(unreadIdsFor(items, ["k"])).toEqual(["1"]);
});

it("picks the tray entries a read-sync covers", () => {
  const entry = (identifier: string, data: unknown) => ({ request: { identifier, content: { data } } });
  const tray = [entry("a", { event: "agent.failed", dedupeKey: "k1" }), entry("b", { event: "agent.failed", dedupeKey: "k2" }), entry("c", {})];
  expect(presentedToDismiss(tray, ["k2"])).toEqual(["b"]);
  expect(presentedToDismiss(tray, [])).toEqual(["a", "b"]);
});
