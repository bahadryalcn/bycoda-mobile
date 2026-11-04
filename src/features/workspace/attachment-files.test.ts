import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  picker: vi.fn(), photos: vi.fn(), copy: vi.fn(), deleted: vi.fn(), write: vi.fn(), id: 0,
  platform: { OS: "android" }, entries: [] as string[],
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("react-native", () => ({ Platform: fixture.platform }));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: fixture.picker }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: fixture.photos }));
vi.mock("expo-crypto", () => ({ randomUUID: () => `file-${++fixture.id}` }));
vi.mock("expo-file-system", () => {
  class Path {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map(part => typeof part === "string" ? part : part.uri).join("/");
    }
    exists = true;
    size = 95;
    name = "native-attachment.md";
    create() {}
    list() { return fixture.entries.map(uri => new Path(uri)); }
    write(bytes: Uint8Array) { fixture.write(this.uri, bytes); }
    delete() { fixture.deleted(this.uri); }
    copy(destination: { uri: string }) { return fixture.copy(this.uri, destination.uri); }
  }
  return { File: Path, Directory: Path, Paths: { document: { uri: "file:///private" } } };
});

import { pickAttachments, stageBrowserCapture, clearAttachmentDraftFiles } from "./attachment-files";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.id = 0; fixture.entries = [];
  fixture.write.mockReset();
  fixture.platform.OS = "android";
  fixture.copy.mockResolvedValue(undefined);
  fixture.picker.mockResolvedValue({ canceled: false, assets: [
    { uri: "content://picker/document", name: "native-attachment.md", mimeType: "text/markdown" },
  ] });
});

it("awaits the granted Android content URI copy before publishing a staged attachment", async () => {
  let finish!: () => void;
  fixture.copy.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  let settled = false;
  const picking = pickAttachments("document", "machine:session").then(files => { settled = true; return files; });
  await vi.waitFor(() => expect(fixture.copy).toHaveBeenCalledOnce());
  expect(settled).toBe(false);
  expect(fixture.picker).toHaveBeenCalledWith({ multiple: true, copyToCacheDirectory: false });
  finish();
  const files = await picking;
  expect(files[0]?.uri).toBe("file:///private/chat-drafts/machine%3Asession/file-1");
  expect(files[0]?.size).toBe(95);
});

it("rejects a failed async copy and cleans partial files without returning false success", async () => {
  fixture.copy.mockRejectedValue(new Error("Missing READ permission"));
  await expect(pickAttachments("document", "machine:session")).rejects.toThrow("Missing READ permission");
  expect(fixture.deleted).toHaveBeenCalledWith("file:///private/chat-drafts/machine%3Asession/file-1");
});

it("keeps the native cache contract for iOS document access", async () => {
  fixture.platform.OS = "ios";
  await pickAttachments("document", "machine:session");
  expect(fixture.picker).toHaveBeenCalledWith({ multiple: true, copyToCacheDirectory: true });
});

it("leaves the current draft alone after native picker cancellation", async () => {
  fixture.picker.mockResolvedValue({ canceled: true });
  expect(await pickAttachments("document", "machine:session")).toEqual([]);
  expect(fixture.copy).not.toHaveBeenCalled();
  expect(fixture.deleted).not.toHaveBeenCalled();
});
const capture = () => ({ id: "capture", projectId: "project", sessionId: "session", navigationId: "nav", capturedAt: "2026-10-22T00:00:00Z", pageUrl: "https://fixture.invalid",
  viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0 }, devicePixelRatio: 1, trust: "untrusted-page-data" as const, limitations: ["Masked"],
  element: { tag: "button", text: "Page text", selector: "#fixture", path: "body > button", bounds: { x: 1, y: 2, width: 20, height: 30 }, center: { x: 11, y: 17 }, ancestry: [], computedStyle: {} },
  screenshot: { mimeType: "image/jpeg" as const, data: "YWJj", width: 1280, height: 720 } });
it("stages canonical browser metadata and decoded JPEG bytes only in the originating private draft directory", () => {
  const file = stageBrowserCapture(capture(), "Owner comment", { machineId: "machine", projectId: "project", sessionId: "session", navigationId: "nav" });
  expect(file).toMatchObject({ uri: "file:///private/chat-drafts/machine%3Asession/file-1", size: 3, kind: "image", mimeType: "image/jpeg", browserAnnotation: { comment: "Owner comment", trust: "untrusted-page-data", sessionId: "session" } });
  expect(fixture.write).toHaveBeenCalledWith(file.uri, new Uint8Array([97, 98, 99]));
  expect(() => stageBrowserCapture(capture(), "", { machineId: "machine", projectId: "other", sessionId: "session", navigationId: "nav" })).toThrow();
  expect(fixture.write).toHaveBeenCalledOnce();
});
it("removes a partial staged browser file after write failure", () => {
  fixture.write.mockImplementation(() => { throw new Error("Disk full"); });
  expect(() => stageBrowserCapture(capture(), "", { machineId: "machine", projectId: "project", sessionId: "session", navigationId: "nav" })).toThrow("Disk full");
  expect(fixture.deleted).toHaveBeenCalledExactlyOnceWith("file:///private/chat-drafts/machine%3Asession/file-1");
});

it("sweeps only unprotected app-owned staging entries and leaves the root/recovery scope intact", () => {
  fixture.entries = ["file:///private/chat-drafts/keep%3Asession", "file:///private/chat-drafts/drop%3Asession"];
  clearAttachmentDraftFiles(["keep:session"]); expect(fixture.deleted).toHaveBeenCalledExactlyOnceWith("file:///private/chat-drafts/drop%3Asession");
});
it("refuses an out-of-root entry before deleting any staged files", () => {
  fixture.entries = ["file:///private/chat-drafts/drop%3Asession", "file:///private/other-data"];
  expect(() => clearAttachmentDraftFiles([])).toThrow("Invalid attachment draft directory"); expect(fixture.deleted).not.toHaveBeenCalled();
});
it("does not copy a picker result returned after its draft owner was cleared", async () => {
  const { default: disk } = await import("@react-native-async-storage/async-storage"); const { withDraftStorageCleanup } = await import("@/state/local-draft-storage");
  let reply!: (value: unknown) => void; fixture.picker.mockImplementationOnce(() => new Promise(resolve => { reply = resolve; }));
  const picking = pickAttachments("document", "retired:session").catch(error => error as Error);
  await withDraftStorageCleanup(disk, async retire => retire(new Set()));
  reply({ canceled: false, assets: [{ uri: "content://provider/document", name: "new.txt", mimeType: "text/plain" }] });
  expect(String(await picking)).toContain("saved draft was cleared"); expect(fixture.copy).not.toHaveBeenCalled();
});
it("drains an in-progress copy before allowing the attachment sweep", async () => {
  const { default: disk } = await import("@react-native-async-storage/async-storage"); const { withDraftStorageCleanup } = await import("@/state/local-draft-storage");
  let finish!: () => void; fixture.copy.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const picking = pickAttachments("document", "copying:session"); await vi.waitFor(() => expect(fixture.copy).toHaveBeenCalledOnce()); const sweep = vi.fn();
  const cleanup = withDraftStorageCleanup(disk, async retire => { retire(new Set()); sweep(); });
  expect(sweep).not.toHaveBeenCalled(); finish(); await picking; await cleanup; expect(sweep).toHaveBeenCalledOnce();
});
