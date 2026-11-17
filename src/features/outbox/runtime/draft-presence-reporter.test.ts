import { expect, it, vi } from "vitest";
vi.mock("@/state/queries", () => ({ useHostClient: vi.fn() }));
vi.mock("@/state/security", () => ({ useSecurity: vi.fn(), isAppContentVisible: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("./store", () => ({ sendOutbox: {} }));
import { draftPresenceChanged, draftPresenceSnapshot } from "./draft-presence-reporter";
const raw = (text: string) => `bycoda-composer-v2:\n${JSON.stringify({ version: 2, text, attachments: [], selectedMentionRefs: [] })}`;
it("includes text, attachments and pending outbox; scopes to computer and deduplicates", () => {
  expect(draftPresenceSnapshot("m", [
    ["bycoda.mobile.draft.v1:m:text", raw("hello")],
    ["bycoda.mobile.draft.v1:m:empty", raw("")],
    ["bycoda.mobile.draft.v1:other:secret", raw("secret")],
    ["bycoda.mobile.draft.v1:m:attachment", `bycoda-composer-v2:\n${JSON.stringify({ version: 2, text: "", selectedMentionRefs: [], attachments: [{ id: "b4772320-03db-4cd1-8c38-03c346f4ffb5", uri: "file:/draft", name: "draft.txt", mimeType: "text/plain", kind: "file", size: 1 }] })}`],
  ], [
    { machineId: "m", sessionId: "queued", status: "waiting" },
    { machineId: "m", sessionId: "text", status: "blocked" },
    { machineId: "m", sessionId: "sent", status: "delivered" },
    { machineId: "other", sessionId: "other", status: "waiting" },
  ])).toEqual(["attachment", "queued", "text"]);
});
it("malformed persisted drafts never become clean clearance", () => {
  expect(() => draftPresenceSnapshot("m", [["bycoda.mobile.draft.v1:m:s", "bycoda-composer-v2:\n{broken"]], [])).toThrow();
});
it("diff sends initial full snapshot, updates and clearing; unchanged skips", () => {
  expect(draftPresenceChanged(undefined, [])).toBe(true);
  expect(draftPresenceChanged([], [])).toBe(false);
  expect(draftPresenceChanged([], ["s"])).toBe(true);
  expect(draftPresenceChanged(["s"], [])).toBe(true);
});
