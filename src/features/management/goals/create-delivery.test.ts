import { expect, it, vi } from "vitest";
import type { HostGoal, HostGoalInput } from "@/domain/types";
import { RemoteHostError } from "@/remote/host-error";
import { GoalCreateDelivery } from "./create-delivery";

const input = { id: "stable-epic", title: "Original", prompt: "Ship", projectIds: ["project"], leadProjectId: "project" } as HostGoalInput;
const accepted = { ...input, status: "planning" } as HostGoal;

it("reconciles accepted creation after ACK loss before considering draft edits", async () => {
  const delivery = new GoalCreateDelivery();
  const write = vi.fn().mockRejectedValue(new RemoteHostError("original", "network", "ACK lost", true));
  await expect(delivery.submit(input, () => true, async () => [], write)).rejects.toThrow("ACK lost");
  await expect(delivery.submit({ ...input, title: "Edited" }, () => true, async () => [accepted], write)).resolves.toEqual(accepted);
  expect(write).toHaveBeenCalledOnce();
  expect(write).toHaveBeenCalledWith({ ...input, expectedAbsent: true });
});

it("does not treat a failed read as absence or retarget an unknown creation", async () => {
  const delivery = new GoalCreateDelivery();
  const write = vi.fn().mockRejectedValue(new Error("ACK lost"));
  const read = vi.fn().mockRejectedValue(new RemoteHostError("original", "network", "List failed"));
  await expect(delivery.submit(input, () => true, read, write)).rejects.toThrow("ACK lost");
  await expect(delivery.submit(input, () => false, read, write)).rejects.toThrow("original computer");
  expect(read).not.toHaveBeenCalled();
  await expect(delivery.submit(input, () => true, read, write)).rejects.toThrow("List failed");
  expect(delivery.pending).toEqual(input);
  await expect(delivery.submit({ ...input, title: "Edited" }, () => true, async () => [], write)).rejects.toThrow("original draft");
  expect(write).toHaveBeenCalledOnce();
});

it("keeps one immutable payload during a concurrent edit and permits correction after a definite refusal", async () => {
  const delivery = new GoalCreateDelivery();
  let reject!: (error: Error) => void;
  const write = vi.fn(() => new Promise<HostGoal>((_resolve, fail) => { reject = fail; }));
  const draft = { ...input };
  const pending = delivery.submit(draft, () => true, async () => [], write);
  draft.title = "Edited";
  await expect(delivery.submit(draft, () => true, async () => [], write)).rejects.toThrow("already being checked");
  expect(delivery.pending?.title).toBe("Original");
  reject(new RemoteHostError("original", "host", "Denied", false));
  await expect(pending).rejects.toThrow("Denied");
  expect(delivery.pending).toBeUndefined();
  await expect(delivery.submit(draft, () => true, async () => [], async goal => ({ ...accepted, ...goal }))).resolves.toMatchObject({ id: input.id, title: "Edited" });
});
