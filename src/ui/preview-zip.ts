import { unzipSync } from "fflate";

export type ZipEntry = { name: string; size: number; compressedSize: number; directory: boolean };
export type ZipListing = { entries: ZipEntry[]; total: number; truncated: boolean };

/** Archives above this size are not read into memory for a listing. */
export const ZIP_PREVIEW_MAX_BYTES = 20 * 1024 * 1024;
export const ZIP_PREVIEW_MAX_ENTRIES = 1000;

/**
 * Lists an archive's entries from its directory without inflating any of them.
 * Throws a plain Error for oversize or unreadable input.
 */
export function listZipEntries(bytes: Uint8Array): ZipListing {
  if (bytes.byteLength > ZIP_PREVIEW_MAX_BYTES) throw new Error("This archive is too large to preview.");
  const entries: ZipEntry[] = [];
  let total = 0;
  try {
    // Returning false from the filter skips decompression, so only metadata is read.
    unzipSync(bytes, {
      filter(file) {
        total += 1;
        if (entries.length < ZIP_PREVIEW_MAX_ENTRIES)
          entries.push({
            name: file.name,
            size: file.originalSize,
            compressedSize: file.size,
            directory: file.name.endsWith("/"),
          });
        return false;
      },
    });
  } catch {
    throw new Error("This file is not a readable zip archive.");
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { entries, total, truncated: total > entries.length };
}
