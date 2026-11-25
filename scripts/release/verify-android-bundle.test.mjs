import assert from "node:assert/strict";
import { test } from "node:test";
import { hasAlignedLoadSegments } from "./verify-android-bundle.mjs";

function nativeLibrary(alignment, address = 16_384n) {
  const bytes = Buffer.alloc(120);
  bytes.writeUInt32BE(0x7f454c46);
  bytes[4] = 2;
  bytes[5] = 1;
  bytes.writeBigUInt64LE(64n, 32);
  bytes.writeUInt16LE(56, 54);
  bytes.writeUInt16LE(1, 56);
  bytes.writeUInt32LE(1, 64);
  bytes.writeBigUInt64LE(address, 80);
  bytes.writeBigUInt64LE(alignment, 112);
  return bytes;
}

test("accepts a 64-bit ELF with 16 KB and larger compatible load alignment", () => {
  assert.equal(hasAlignedLoadSegments(nativeLibrary(16_384n)), true);
  assert.equal(hasAlignedLoadSegments(nativeLibrary(65_536n, 65_536n)), true);
});

test("rejects 4 KB alignment, incongruent addresses and incomplete ELF headers", () => {
  assert.equal(hasAlignedLoadSegments(nativeLibrary(4_096n)), false);
  assert.equal(hasAlignedLoadSegments(nativeLibrary(16_384n, 4_096n)), false);
  assert.equal(hasAlignedLoadSegments(nativeLibrary(16_384n).subarray(0, 119)), false);
});
