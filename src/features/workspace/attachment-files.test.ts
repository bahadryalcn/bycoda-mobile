import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  picker: vi.fn(), photos: vi.fn(), copy: vi.fn(), deleted: vi.fn(), id: 0,
  platform: { OS: "android" },
}));
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
    delete() { fixture.deleted(this.uri); }
    copy(destination: { uri: string }) { return fixture.copy(this.uri, destination.uri); }
  }
  return { File: Path, Directory: Path, Paths: { document: { uri: "file:///private" } } };
});

import { pickAttachments } from "./attachment-files";

beforeEach(() => {
  vi.clearAllMocks();
  fixture.id = 0;
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
