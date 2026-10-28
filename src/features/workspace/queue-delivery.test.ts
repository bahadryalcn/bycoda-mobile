import { describe, expect, it } from "vitest";
import type { SharedQueue } from "../../../../src/features/connections/model/sharedQueue";
import { appendMobileQueue, deliveryAfterRun, mobileDrainsQueue } from "./queue-delivery";

const row = { id: "next", text: "Next instruction", attachments: [] };
const empty = (): SharedQueue => ({ revision: 1, messages: [] });

describe("mobile follow-up delivery", () => {
  it("activates a fresh durable host queue without taking a mobile lease", () => {
    const queued = appendMobileQueue({ ...empty(), leased: true, hostTime: 123 }, row);
    expect(queued).toMatchObject({ status: "active", messages: [row] });
    expect(queued.consumer).toBeUndefined();
    expect(queued.drain).toBeUndefined();
    expect(mobileDrainsQueue(queued, "mobile:this")).toBe(false);
  });

  it("does not resume explicit pauses, restored work, stopped queues or edits when appending", () => {
    const cases: SharedQueue[] = [
      { ...empty(), status: "paused" },
      { ...empty(), status: "restored" },
      { ...empty(), holdReason: "stopped" },
      { ...empty(), editingId: "editing" },
      { ...empty(), messages: [{ ...row, id: "unknown", deliveryUnknown: true }] },
    ];
    for (const before of cases) {
      const after = appendMobileQueue(before, row);
      expect(after.status).toBe(before.status ?? "paused");
      expect(after.editingId).toBe(before.editingId);
      expect(after.holdReason).toBe(before.holdReason);
      expect(after.messages).toContain(row);
    }
  });

  it("reconciles repeated enqueue ids without adding rows or changing a hold", () => {
    const before: SharedQueue = {
      ...empty(),
      messages: [row],
      status: "paused",
      holdReason: "error",
    };
    expect(appendMobileQueue(before, row)).toBe(before);
  });

  it("keeps a foreign consumer and its active queue when adding a follow-up", () => {
    const before: SharedQueue = {
      ...empty(),
      messages: [{ ...row, id: "prior" }],
      status: "active",
      consumer: "desktop:other",
    };
    const after = appendMobileQueue(before, row);
    expect(after.consumer).toBe("desktop:other");
    expect(after.status).toBe("active");
    expect(mobileDrainsQueue(after, "mobile:this")).toBe(false);
  });

  it("drains an older host only for this process's confirmed active queue", () => {
    const own: SharedQueue = {
      ...empty(),
      messages: [row],
      status: "active",
      consumer: "mobile:this",
    };
    expect(mobileDrainsQueue(own, "mobile:this")).toBe(true);
    for (const held of [
      { ...own, consumer: "mobile:previous-process" },
      { ...own, leased: true as const },
      { ...own, status: "paused" as const },
      { ...own, editingId: row.id },
      { ...own, claim: { id: row.id, clientId: "mobile:this", token: "pending" } },
      { ...own, messages: [{ ...row, deliveryUnknown: true as const }] },
    ])
      expect(mobileDrainsQueue(held, "mobile:this")).toBe(false);
  });

  it("returns stale Steer and automatic Queue choices to Send after a turn ends", () => {
    expect(deliveryAfterRun("steer", true, false)).toBe("send");
    expect(deliveryAfterRun("queue", true, false, false)).toBe("send");
    expect(deliveryAfterRun("queue", true, false, true)).toBe("queue");
    expect(deliveryAfterRun("steer", true, true)).toBe("steer");
    expect(deliveryAfterRun("steer", false, false)).toBe("steer");
  });
});
