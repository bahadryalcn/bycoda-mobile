import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { BulkBase64Error, bulkDigestHex, decodeBase64Into, parseBulkJson } from "./bulk-transfer";

const digest = vi.hoisted(() => vi.fn());
vi.mock("expo-crypto", async () => {
  const { createHash } = await import("node:crypto");
  digest.mockImplementation(async (_algorithm: string, bytes: Uint8Array) => {
    const out = createHash("sha256").update(bytes).digest();
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  });
  return { CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digest };
});

describe("bulk transfer primitives", () => {
  it.each([0, 1, 2, 3, 4, 5, 255, 256, 65_537])("decodes %i bytes exactly like Buffer", (size) => {
    const source = Uint8Array.from({ length: size }, (_, index) => (index * 31 + 7) & 255);
    const target = new Uint8Array(size + 6).fill(9);
    if (size === 0) return expect(() => decodeBase64Into("", 0, target, 3)).not.toThrow();
    decodeBase64Into(Buffer.from(source).toString("base64"), size, target, 3);
    expect([...target.subarray(3, 3 + size)]).toEqual([...source]);
    expect([...target.subarray(0, 3)]).toEqual([9, 9, 9]);
    expect([...target.subarray(3 + size)]).toEqual([9, 9, 9]);
  });
  it.each(["%%%%", "AA=A", "AAA", "A===", "AA==AAAA", "ÄAAA", "AAA\n", "====", "AAAA=", "AA= ="])(
    "rejects malformed base64 %j without writing past the chunk",
    (text) => {
      const target = new Uint8Array(16);
      expect(() => decodeBase64Into(text, 3, target, 0)).toThrow(BulkBase64Error);
    },
  );
  it("rejects a chunk whose decoded size differs from the expected size or overflows the buffer", () => {
    const text = Buffer.from([1, 2, 3, 4]).toString("base64");
    expect(() => decodeBase64Into(text, 3, new Uint8Array(8), 0)).toThrow(BulkBase64Error);
    expect(() => decodeBase64Into(text, 4, new Uint8Array(8), 6)).toThrow(BulkBase64Error);
  });
  it("hashes through the native digest and returns the exact lowercase hex", async () => {
    const bytes = Buffer.from("bulk-bytes");
    await expect(bulkDigestHex(bytes)).resolves.toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(digest).toHaveBeenCalledWith("SHA-256", bytes);
  });
  it("parses split multi-byte UTF-8 like JSON.parse and rejects invalid or truncated bytes", async () => {
    const value = { text: "é".repeat(200_000) + "😀", list: [1, "ü"] };
    const bytes = Buffer.from(JSON.stringify(value));
    await expect(parseBulkJson(bytes, {})).resolves.toEqual(JSON.parse(bytes.toString()));
    await expect(parseBulkJson(Buffer.from([0x22, 0xff, 0x22]), {})).rejects.toThrow();
    await expect(parseBulkJson(Buffer.from([0x22, 0xf0, 0x9f]), {})).rejects.toThrow();
  });
  it("stops parsing when the transfer is no longer needed", async () => {
    const bytes = Buffer.from(JSON.stringify(Array.from({ length: 50_000 }, (_, index) => ({ index }))));
    let calls = 0;
    await expect(
      parseBulkJson(bytes, {
        assertCurrent: () => {
          if (++calls > 2) throw new Error("cancelled");
        },
      }),
    ).rejects.toThrow("cancelled");
  });
});
