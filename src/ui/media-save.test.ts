import { expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ perm: vi.fn(), create: vi.fn() }));
vi.mock("expo-media-library", () => ({ requestPermissionsAsync: m.perm, Asset: { create: m.create } }));
vi.mock("./copy", () => ({ useCopy: () => (_t: string, e: string) => e }));
vi.mock("./toast", () => ({ showToast: vi.fn() }));
import { saveImageToPhotos } from "./media-save";
it("asks add-only permission then writes the asset", async () => {
  m.perm.mockResolvedValue({ granted: true }); m.create.mockResolvedValue({});
  await saveImageToPhotos("file:///a.png", { denied: "no" });
  expect(m.perm).toHaveBeenCalledWith(true, ["photo"]); expect(m.create).toHaveBeenCalledWith("file:///a.png");
});
it("fails with the denial message and writes nothing", async () => {
  m.create.mockClear(); m.perm.mockResolvedValue({ granted: false });
  await expect(saveImageToPhotos("file:///a.png", { denied: "no" })).rejects.toThrow("no"); expect(m.create).not.toHaveBeenCalled();
});
