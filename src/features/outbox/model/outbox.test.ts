import { describe, expect, it } from "vitest";
import { emptyComposerDraft } from "../../workspace/composer-draft";
import { decodeOutbox, offlineSendFailure, outboxDraftIdentity, outboxExpired, outboxKey, outboxNoticeKind, outboxOwned, SendOutbox, type OutboxRow } from "./outbox";

const row = (id = "8ca190f8-9e1b-477d-9565-2fb1283ac578"): OutboxRow => ({
  id, machineId: "machine", sessionId: "session", projectId: "project", environmentId: "environment", accountId: "account",
  createdAt: 1, mode: "send", draft: { ...emptyComposerDraft(), text: "hello" },
  command: { type: "send", sessionId: "session", clientMessageId: id, text: "hello" },
  model: { harness: "codex", model: "codex:test", modelSettings: {} }, status: "waiting", attempted: false,
});
function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    getAllKeys: async () => [...values.keys()],
  };
  return { values, storage, outbox: new SendOutbox(storage) };
}
describe("offline send custody", () => {
  it("never resurrects a message deleted during an awaited send", async () => {
    const { outbox } = fixture();
    const value = row();
    await outbox.put(value);
    await outbox.remove(value);
    await expect(outbox.update({ ...value, status: "waiting" })).rejects.toThrow("removed");
    expect(await outbox.read("machine", "session")).toEqual([]);
  });
  it("preserves edited message identity through the existing draft codec", () => {
    const draft = { ...emptyComposerDraft(), text: "edited", clientMessageId: row().id };
    expect(outboxDraftIdentity(draft)).toBe(row().id);
    const invalid = { ...draft, clientMessageId: "bad" };
    expect(() => outboxDraftIdentity(invalid)).toThrow("identity");
  });
  it("rejects excess per-session custody without eviction", async () => {
    const { outbox } = fixture();
    for (let index = 0; index < 100; index++) await outbox.put(row(`8ca190f8-9e1b-477d-9565-${index.toString(16).padStart(12, "0")}`));
    await expect(outbox.put(row())).rejects.toThrow();
    expect(await outbox.read("machine", "session")).toHaveLength(100);
  });
  it("persists exact intent and restores after process restart", async () => {
    const { storage, outbox } = fixture();
    await outbox.put(row());
    expect(await new SendOutbox(storage).read("machine", "session")).toEqual([row()]);
  });
  it("serializes concurrent updates and preserves per-session order", async () => {
    const { outbox } = fixture();
    const second = row("8ca190f8-9e1b-477d-9565-2fb1283ac579");
    await Promise.all([outbox.put(row()), outbox.put(second)]);
    expect(await outbox.read("machine", "session")).toEqual([row(), second]);
  });
  it("does not clear or evict anything when storage fails", async () => {
    const { storage, outbox } = fixture();
    await outbox.put(row());
    storage.setItem = async () => { throw new Error("disk full"); };
    await expect(outbox.remove(row())).rejects.toThrow("disk full");
    expect(await outbox.read("machine", "session")).toEqual([row()]);
  });
  it("drops pending sends visibly on sign-out and does not reactivate after sign-in", async () => {
    const { outbox } = fixture();
    await outbox.put(row());
    await outbox.dropAccount(null);
    await outbox.dropAccount("account");
    expect((await outbox.read("machine", "session"))[0]?.status).toBe("dropped");
  });
  it("keeps machine/session storage separate", async () => {
    const { outbox } = fixture();
    await outbox.put(row());
    expect(await outbox.read("other", "session")).toEqual([]);
    expect(await outbox.read("machine", "other")).toEqual([]);
  });
  it("retains bytes and claim references through persistence", async () => {
    const { outbox } = fixture();
    const value = row();
    value.draft.attachments.push({ id: value.id, claimId: value.id, uri: "file:///draft/photo.png", name: "photo.png", size: 12, mimeType: "image/png", kind: "image" });
    await outbox.put(value);
    expect((await outbox.read("machine", "session"))[0]?.draft.attachments).toEqual(value.draft.attachments);
  });
  it.each(["{}", "[null]", "broken", JSON.stringify([{ ...row(), command: {} }])])("fails closed on damaged storage %s", raw => {
    expect(() => decodeOutbox(raw)).toThrow();
  });
  it("does not overwrite malformed saved custody", async () => {
    const { values, outbox } = fixture();
    values.set(outboxKey("machine", "session"), "broken");
    await expect(outbox.put(row())).rejects.toThrow();
    expect(values.get(outboxKey("machine", "session"))).toBe("broken");
  });
  it.each(["auth", "identity", "host", "unsupported", "protocol", "aborted"])("does not queue %s errors", kind => {
    expect(offlineSendFailure({ kind })).toBe(false);
  });
  it.each(["network", "timeout"])("queues %s errors including unknown acceptance", kind => {
    expect(offlineSendFailure({ kind, uncertain: true })).toBe(true);
  });
});
describe("expired and dropped message recovery", () => {
  it("expires only past 24 hours and never for a future timestamp", () => {
    const now = 100 * 60 * 60 * 1000;
    expect(outboxExpired({ createdAt: now - 24 * 60 * 60 * 1000 }, now)).toBe(false);
    expect(outboxExpired({ createdAt: now - 24 * 60 * 60 * 1000 - 1 }, now)).toBe(true);
    expect(outboxExpired({ createdAt: now + 1 }, now)).toBe(false);
  });
  it("splits notices by cause and offers Edit only to the capturing account and computer", () => {
    expect(outboxNoticeKind({ status: "blocked", blockedReason: "expired" }, true)).toBe("expired");
    expect(outboxNoticeKind({ status: "blocked" }, true)).toBe("blocked");
    expect(outboxNoticeKind({ status: "dropped" }, true)).toBe("unavailable");
    expect(outboxNoticeKind({ status: "dropped" }, false)).toBe("foreign");
    expect(outboxNoticeKind({ status: "waiting" }, true)).toBe("waiting");
    expect(outboxOwned(row(), "account", "environment")).toBe(true);
    expect(outboxOwned(row(), "other", "environment")).toBe(false);
    expect(outboxOwned(row(), "account", "other")).toBe(false);
    expect(outboxOwned(row(), undefined, "environment")).toBe(false);
  });
  it("round-trips the expiry reason and rejects an unknown one", async () => {
    const { outbox } = fixture();
    await outbox.put({ ...row(), status: "blocked", blockedReason: "expired" });
    expect((await outbox.read("machine", "session"))[0]?.blockedReason).toBe("expired");
    expect(() => decodeOutbox(JSON.stringify([{ ...row(), blockedReason: "other" }]))).toThrow();
  });
});
