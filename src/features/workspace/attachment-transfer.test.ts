import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { HostTransport } from "@/remote/transport";
import type { StagedAttachment } from "./attachment-model";
const fixture = vi.hoisted(() => ({ bytes: new Uint8Array([97, 98, 99, 100, 101, 102]), close: vi.fn() }));
vi.mock("expo-file-system", () => ({ File: class { exists = true; get size() { return fixture.bytes.length; } open() { return { offset: 0, readBytes(length: number) { const bytes = fixture.bytes.slice(this.offset, this.offset + length); this.offset += bytes.length; return bytes; }, close: fixture.close }; } } }));
vi.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digest: async (_algorithm: string, bytes: Uint8Array) => new Uint8Array(createHash("sha256").update(bytes).digest()).buffer }));
vi.mock("./attachment-files", () => ({ isScopedStagedFile: () => true }));
import { uploadAttachment } from "./attachment-transfer";
const file: StagedAttachment = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "data.txt", size: 6, mimeType: "text/plain", kind: "file", uri: "file:///staged/file" };
beforeEach(() => { fixture.close.mockClear(); });
it("resumes only after the host prefix hash matches local bytes", async () => {
  const request = vi.fn().mockResolvedValueOnce({ offset: 3, hash: createHash("sha256").update("abc").digest("hex") }).mockResolvedValueOnce({ offset: 6 });
  const client = { machine: { id: "m" }, request } as unknown as HostTransport;
  expect(await uploadAttachment(client, file, "s", new AbortController().signal, () => {})).toEqual({ id: file.id, name: file.name, size: 6, mimeType: file.mimeType, kind: "file" });
  expect(request.mock.calls[1]![1]).toMatchObject({ offset: 3, data: "ZGVm" }); expect(fixture.close).toHaveBeenCalledOnce();
});
it("never appends after mismatched host data or invalid offsets", async () => {
  for (const status of [{ offset: 3, hash: "mismatch" }, { offset: 7 }]) {
    const request = vi.fn().mockResolvedValue(status); const client = { machine: { id: "m" }, request } as unknown as HostTransport;
    await expect(uploadAttachment(client, file, "s", new AbortController().signal, () => {})).rejects.toThrow(); expect(request).toHaveBeenCalledOnce();
  }
});
it("rejects a wrong chunk acknowledgement and cancels without dispatching content", async () => {
  const request = vi.fn().mockResolvedValueOnce({ offset: 0 }).mockResolvedValueOnce({ offset: 5 });
  const client = { machine: { id: "m" }, request } as unknown as HostTransport;
  await expect(uploadAttachment(client, file, "s", new AbortController().signal, () => {})).rejects.toThrow("acknowledgement");
  const aborted = new AbortController(); aborted.abort(); request.mockReset().mockResolvedValue({ offset: 0 });
  await expect(uploadAttachment(client, file, "s", aborted.signal, () => {})).rejects.toThrow("cancelled"); expect(request).toHaveBeenCalledOnce();
});
