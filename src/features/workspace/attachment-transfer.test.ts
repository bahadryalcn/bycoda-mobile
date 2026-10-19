import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { HostTransport } from "@/remote/transport";
import type { StagedAttachment } from "./attachment-model";
const fixture = vi.hoisted(() => ({ bytes: new Uint8Array([97, 98, 99, 100, 101, 102]), close: vi.fn(), reads: [] as number[], onRead: undefined as (() => void) | undefined }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}) } }));
vi.mock("expo-file-system", () => ({ File: class { exists = true; get size() { return fixture.bytes.length; } open() { return { offset: 0, readBytes(length: number) { fixture.reads.push(length); fixture.onRead?.(); const bytes = fixture.bytes.slice(this.offset, this.offset + length); this.offset += bytes.length; return bytes; }, close: fixture.close }; } } }));

vi.mock("./attachment-files", () => ({ isScopedStagedFile: () => true }));
import { uploadAttachment } from "./attachment-transfer";
const file: StagedAttachment = { claimId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "data.txt", size: 6, mimeType: "text/plain", kind: "file", uri: "file:///staged/file" };
beforeEach(() => { fixture.close.mockClear(); fixture.bytes = new Uint8Array([97, 98, 99, 100, 101, 102]); fixture.reads = []; fixture.onRead = undefined; });
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

it("hashes a 20 MiB resume in bounded chunks and preserves its checksum", async () => {
  fixture.bytes = new Uint8Array(20 * 1024 * 1024).fill(97);
  const resumed = { ...file, size: fixture.bytes.length };
  const request = vi.fn().mockResolvedValueOnce({ offset: resumed.size, hash: createHash("sha256").update(fixture.bytes).digest("hex") }).mockResolvedValueOnce({ offset: resumed.size });
  await uploadAttachment({ machine: { id: "m" }, request } as unknown as HostTransport, resumed, "s", new AbortController().signal, () => {});
  expect(Math.max(...fixture.reads)).toBeLessThanOrEqual(192 * 1024);
  expect(fixture.reads.length).toBeGreaterThan(10);
  expect(request.mock.calls[1]![1]).toMatchObject({ offset: resumed.size, data: "" });
  expect(fixture.close).toHaveBeenCalledOnce();
});
it("yields for cancellation during prefix hashing and never uploads unchecked bytes", async () => {
  fixture.bytes = new Uint8Array(1024 * 1024);
  const controller = new AbortController();
  fixture.onRead = () => { setTimeout(() => controller.abort(), 0); };
  const request = vi.fn().mockResolvedValue({ offset: fixture.bytes.length, hash: "unchecked" });
  await expect(uploadAttachment({ machine: { id: "m" }, request } as unknown as HostTransport, { ...file, size: fixture.bytes.length }, "s", controller.signal, () => {})).rejects.toThrow("cancelled");
  expect(fixture.reads).toHaveLength(1);
  expect(request).toHaveBeenCalledOnce();
  expect(fixture.close).toHaveBeenCalledOnce();
});

it("claims managed uploads before status and tags every chunk with the same owner", async () => {
  const request = vi.fn().mockResolvedValueOnce({ claimed: true }).mockResolvedValueOnce({ offset: 0 }).mockResolvedValueOnce({ offset: 6 });
  const client = { machine: { id: "m", capabilities: ["attachments.ownership.v1"] }, request } as unknown as HostTransport;
  await uploadAttachment(client, file, "s", new AbortController().signal, () => {});
  expect(request.mock.calls[0]?.slice(0, 2)).toEqual(["attachments.claim", { ownerId: "mobile:s", claimId: file.claimId, ids: [file.id] }]);
  expect(request.mock.calls[1]?.[1]).toMatchObject({ ownerId: "mobile:s", id: file.id });
  expect(request.mock.calls[2]?.[1]).toMatchObject({ ownerId: "mobile:s", data: "YWJjZGVm" });
});
it("does not start status/upload if its durable host claim fails", async () => {
  const request = vi.fn().mockRejectedValue(new Error("claim refused"));
  const client = { machine: { id: "m", capabilities: ["attachments.ownership.v1"] }, request } as unknown as HostTransport;
  await expect(uploadAttachment(client, file, "s", new AbortController().signal, () => {})).rejects.toThrow("claim refused");
  expect(request).toHaveBeenCalledOnce(); expect(fixture.close).not.toHaveBeenCalled();
});
