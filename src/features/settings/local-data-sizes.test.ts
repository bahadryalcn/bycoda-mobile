import { expect, it } from "vitest";
import { formatBytes, savedDraftBytes } from "./local-data-sizes";

it("formats byte counts", () => {
  expect(formatBytes(0)).toBe("0 B");
  expect(formatBytes(-5)).toBe("0 B");
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1500)).toBe("1.5 KB");
  expect(formatBytes(12_400)).toBe("12 KB");
  expect(formatBytes(3_400_000)).toBe("3.4 MB");
  expect(formatBytes(2_000_000)).toBe("2 MB");
});

it("counts only saved drafts", async () => {
  const data: Record<string, string> = {
    "bycoda.mobile.draft.v1:a:s": "12345",
    "sdk.setting": "x".repeat(500),
  };
  const total = await savedDraftBytes({ getAllKeys: async () => Object.keys(data), getItem: async (key) => data[key] ?? null });
  expect(total).toBe("bycoda.mobile.draft.v1:a:s".length + 5);
});
