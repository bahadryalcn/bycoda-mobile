import { afterEach, expect, it, vi } from "vitest";
import { loadProjectMedia, loadSessionMedia, clearMediaCache } from "./media-loader";
import type { MessageContext } from "./media-policy";
const state = vi.hoisted(() => ({ files: [] as { exists: boolean; chunks: Uint8Array[]; deleted: boolean }[] }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "random" }));
vi.mock("expo-file-system", () => {
  class File {
    exists = false; chunks: Uint8Array[] = []; deleted = false; uri = "file://private"; size = 0;
    constructor() { state.files.push(this); }
    create() { this.exists = true; }
    delete() { this.exists = false; this.deleted = true; }
    open() { return { writeBytesSync: (data: Uint8Array) => { this.chunks.push(data); this.size += data.length; }, close: () => {} }; }
  }
  class Directory { exists = false; create() {} list() { return []; } }
  return { File, Directory, Paths: { cache: "cache" } };
});
afterEach(() => { state.files.length = 0; });
it("writes bounded version-pinned chunks before exposing the completed media", async () => {
  const bytes = Buffer.alloc(1024 * 1024, 5);
  const request = vi.fn(async (_method, params) => {
    if (params.command === "read_file_info") return { size: bytes.length, version: "fixed" };
    expect(params.command).toBe("read_file_chunk"); expect(params.args.version).toBe("fixed");
    const data = bytes.subarray(params.args.offset, params.args.offset + params.args.length);
    return { data: data.toString("base64"), offset: params.args.offset, length: data.length };
  });
  await expect(loadProjectMedia({ cwd: "/project", machineId: "m", client: { request } } as unknown as MessageContext, "image.png")).resolves.toMatchObject({ uri: "file://private", mimeType: "image/png" });
  const file = state.files.at(-1)!;
  expect(file.chunks).toHaveLength(4); expect(Math.max(...file.chunks.map((chunk) => chunk.length))).toBe(256 * 1024);
  expect(Buffer.concat(file.chunks.map((chunk) => Buffer.from(chunk))).equals(bytes)).toBe(true);
  expect(request.mock.calls.filter((call) => call[1].command === "read_file_info")).toHaveLength(2);
});
it("deletes incomplete data when the final version changes or the read is cancelled", async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController(); let infos = 0;
    const request = vi.fn(async (_method, params) => {
      if (params.command === "read_file_info") return { size: 1, version: ++infos === 1 ? "before" : "after" };
      if (cancel) controller.abort();
      return { data: "AA==", offset: 0, length: 1 };
    });
    await expect(loadProjectMedia({ cwd: "/project", machineId: "m", client: { request } } as unknown as MessageContext, "image.png", controller.signal)).rejects.toThrow();
    expect(state.files.at(-1)!.deleted).toBe(true);
  }
});

it("does not recreate project cache files when a late metadata read follows cleanup", async () => {
  let reply!: (value: unknown) => void; const request = vi.fn(() => new Promise(resolve => { reply = resolve; }));
  const context = { client: { request }, machineId: "machine", projectId: "project", cwd: "/project" } as unknown as MessageContext;
  const loading = loadProjectMedia(context, "image.png").catch(error => error as Error); clearMediaCache(); reply({ size: 3, version: "old" });
  expect(String(await loading)).toContain("media cache was cleared"); expect(state.files).toHaveLength(0);
});
it("does not write or publish an attachment chunk after cache cleanup", async () => {
  let reply!: (value: unknown) => void; const request = vi.fn(() => new Promise(resolve => { reply = resolve; }));
  const context = { client: { request }, machineId: "machine", sessionId: "session" } as unknown as MessageContext;
  const loading = loadSessionMedia(context, "file", "file.txt", "text/plain").catch(error => error as Error); clearMediaCache(); reply({ data: "YWJj", offset: 3, size: 3 });
  expect(String(await loading)).toContain("media cache was cleared"); expect(state.files[0].chunks).toHaveLength(0); expect(state.files[0].deleted).toBe(true);
});
