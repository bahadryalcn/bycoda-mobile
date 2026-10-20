import { describe, expect, it, vi } from "vitest";
import { requestDevicePermission } from "./permission-flow";

describe("device permission recovery", () => {
  it("requests OS permission instead of opening Settings on a fresh install", async () => {
    const read = vi.fn().mockResolvedValue({ granted: false, canAskAgain: true, status: "undetermined" });
    const request = vi.fn().mockResolvedValue({ granted: true, canAskAgain: true, status: "granted" });
    const settings = vi.fn();
    expect((await requestDevicePermission(read, request, settings)).granted).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(settings).not.toHaveBeenCalled();
  });
  it("offers Settings only after permanent denial", async () => {
    const request = vi.fn();
    const settings = vi.fn().mockResolvedValue(undefined);
    await requestDevicePermission(async () => ({ granted: false, canAskAgain: false, status: "denied" }), request, settings);
    expect(settings).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });
  it("does not ask again when permission is granted", async () => {
    const request = vi.fn();
    const settings = vi.fn();
    await requestDevicePermission(async () => ({ granted: true, canAskAgain: true, status: "granted" }), request, settings);
    expect(request).not.toHaveBeenCalled();
    expect(settings).not.toHaveBeenCalled();
  });
});
