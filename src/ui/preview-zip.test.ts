import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { listZipEntries, ZIP_PREVIEW_MAX_BYTES } from "./preview-zip";

describe("listZipEntries", () => {
  it("lists names and sizes without extraction", () => {
    const bytes = zipSync({ "b.txt": strToU8("hello world".repeat(20)), "dir/a.txt": strToU8("x") });
    const listing = listZipEntries(bytes);
    expect(listing.entries.map((entry) => entry.name)).toEqual(["b.txt", "dir/a.txt"]);
    expect(listing.entries[0]!.size).toBe(220);
    expect(listing.entries[0]!.compressedSize).toBeLessThan(220);
    expect(listing.truncated).toBe(false);
  });

  it("rejects non-zip input and oversize archives", () => {
    expect(() => listZipEntries(strToU8("not a zip"))).toThrow(/zip/);
    expect(() => listZipEntries({ byteLength: ZIP_PREVIEW_MAX_BYTES + 1 } as Uint8Array)).toThrow(/too large/);
  });
});
