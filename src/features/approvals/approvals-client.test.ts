import { describe, expect, it, vi } from "vitest";
import { RemoteHostError } from "@/remote/host-error";
import { ApprovalDecisionError, ApprovalsClient } from "./approvals-client";
import { parseApprovals, remainingTime, sortApprovals, type ApprovalView } from "./approvals-model";

const view = (patch: Partial<ApprovalView> = {}): ApprovalView => ({
  id: "a1",
  title: "t",
  message: "m",
  confirmLabel: "Send",
  cancelLabel: "Cancel",
  deadline: 10_000,
  remote: true,
  signature: "s".repeat(64),
  status: "pending",
  ...patch,
});

describe("approvals client", () => {
  it("lists with a single non-retried request and drops malformed entries", async () => {
    const request = vi.fn(async () => ({ approvals: [view(), { id: "bad" }] }));
    const list = await new ApprovalsClient({ request }).list();
    expect(request).toHaveBeenCalledWith("approvals.list", {}, { retry: false, signal: undefined });
    expect(list.map((entry) => entry.id)).toEqual(["a1"]);
  });

  it("sends the displayed signature once and returns the host result", async () => {
    const request = vi.fn(async () => ({ id: "a1", status: "pending", approved: true, alreadyDecided: false }));
    const result = await new ApprovalsClient({ request }).decide(view(), true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "approvals.decide",
      { id: "a1", signature: "s".repeat(64), approved: true },
      { retry: false },
    );
    expect(result.approved).toBe(true);
  });

  it("separates a refusal from an unknown result and never resends", async () => {
    const refused = vi.fn(async () => {
      throw new RemoteHostError("m", "protocol", "no");
    });
    await expect(new ApprovalsClient({ request: refused }).decide(view(), false)).rejects.toMatchObject({ code: "rejected" });
    const lost = vi.fn(async () => {
      throw new RemoteHostError("m", "network", "timeout", true);
    });
    await expect(new ApprovalsClient({ request: lost }).decide(view(), false)).rejects.toBeInstanceOf(ApprovalDecisionError);
    await expect(new ApprovalsClient({ request: lost }).decide(view(), false)).rejects.toMatchObject({ code: "uncertain" });
    expect(lost).toHaveBeenCalledTimes(2);
    const garbled = vi.fn(async () => ({ id: "other" }));
    await expect(new ApprovalsClient({ request: garbled }).decide(view(), true)).rejects.toMatchObject({ code: "uncertain" });
    expect(garbled).toHaveBeenCalledTimes(1);
  });
});

describe("approvals model", () => {
  it("puts pending first, focused first, and settled newest first", () => {
    const sorted = sortApprovals(
      [
        view({ id: "old", status: "approved", decidedAt: 1 }),
        view({ id: "late", deadline: 9 }),
        view({ id: "new", status: "denied", decidedAt: 5 }),
        view({ id: "soon", deadline: 2 }),
        view({ id: "focus", deadline: 99 }),
      ],
      "focus",
    );
    expect(sorted.map((entry) => entry.id)).toEqual(["focus", "soon", "late", "new", "old"]);
  });

  it("counts down and stops at the deadline", () => {
    expect(remainingTime(65_000, 0)).toBe("1:05");
    expect(remainingTime(1000, 1000)).toBeNull();
  });
});

describe("approvals parse", () => {
  it("returns nothing for a non-list", () => {
    expect(parseApprovals(null)).toEqual([]);
  });
});
