import { expect, it, vi } from "vitest";
import { failedPermissionKinds, markRetrying, pendingPermissionReads, readDevicePermissionStatuses } from "./device-permission-status";

const granted = { granted: true, canAskAgain: true, status: "granted" } as const;

it("settles each kind independently so one failing read keeps the other usable", async () => {
  const failure = new Error("native module unavailable");
  const read = vi.fn(async (kind: "camera" | "notifications") => { if (kind === "notifications") throw failure; return granted; });
  const next = await readDevicePermissionStatuses(["camera", "notifications"], read);
  expect(next.camera).toEqual({ status: "ready", permission: granted });
  expect(next.notifications).toEqual({ status: "error", error: failure });
  expect(read).toHaveBeenCalledTimes(2);
});
it("captures a synchronous reader throw as that kind's error", async () => {
  const next = await readDevicePermissionStatuses(["camera"], () => { throw new Error("sync"); });
  expect(next.camera).toMatchObject({ status: "error" });
});
it("retry marks only failed reads pending and leaves usable results untouched", () => {
  const reads = { camera: { status: "ready", permission: granted }, notifications: { status: "error", error: new Error("x") } } as const;
  const retrying = markRetrying({ ...reads }, ["camera", "notifications"]);
  expect(retrying.camera).toBe(reads.camera); expect(retrying.notifications).toEqual({ status: "pending" });
  expect(failedPermissionKinds({ ...reads })).toEqual(["notifications"]);
  const settled = pendingPermissionReads(); expect(markRetrying(settled, ["camera"])).toBe(settled);
});
